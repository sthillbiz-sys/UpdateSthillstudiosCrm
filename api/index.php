<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

set_cors_headers();
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

try {
    ensure_runtime_schema();
    seed_initial_data();
} catch (Throwable $e) {
    json_response(['error' => 'Database unavailable', 'details' => $e->getMessage()], 500);
}

$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
$route = trim((string) ($_GET['route'] ?? ''), '/');
if ($route === '' && isset($_SERVER['PATH_INFO'])) {
    $route = trim((string) $_SERVER['PATH_INFO'], '/');
}

try {
    // Public endpoints.
    if ($route === 'health' && $method === 'GET') {
        json_response(['ok' => true, 'runtime' => 'php', 'timestamp' => gmdate('c')]);
    }

    if ($route === 'auth/login' && $method === 'POST') {
        $input = read_json_body();
        $email = strtolower(trim((string) ($input['email'] ?? '')));
        $password = (string) ($input['password'] ?? '');
        if ($email === '' || $password === '') {
            json_response(['error' => 'Email and password are required'], 400);
        }

        $stmt = db()->prepare('SELECT id, name, email, password, role FROM users WHERE email = ? LIMIT 1');
        $stmt->execute([$email]);
        $user = $stmt->fetch();
        if (!$user) {
            json_response(['error' => 'Invalid credentials'], 401);
        }

        $storedPassword = (string) $user['password'];
        $usesHash = password_is_hash($storedPassword);
        $matches = $usesHash ? password_verify($password, $storedPassword) : hash_equals($storedPassword, $password);
        if (!$matches) {
            json_response(['error' => 'Invalid credentials'], 401);
        }

        if (!$usesHash) {
            $hashedPassword = password_hash($password, PASSWORD_BCRYPT);
            $update = db()->prepare('UPDATE users SET password = ? WHERE id = ?');
            $update->execute([$hashedPassword, (int) $user['id']]);
        }

        ensure_employee_record_for_user($user);

        $safeUser = safe_user_from_row($user);
        $token = sign_token($safeUser);
        json_response(['token' => $token, 'user' => $safeUser]);
    }

    if ($route === 'auth/signup' && $method === 'POST') {
        if (!env_bool('ALLOW_SIGNUP', false)) {
            json_response(['error' => 'Signup is disabled'], 403);
        }

        $input = read_json_body();
        $name = trim((string) ($input['name'] ?? ''));
        $email = strtolower(trim((string) ($input['email'] ?? '')));
        $password = (string) ($input['password'] ?? '');
        if ($name === '' || $email === '' || $password === '') {
            json_response(['error' => 'Name, email, and password are required'], 400);
        }

        $hashedPassword = password_hash($password, PASSWORD_BCRYPT);
        try {
            $stmt = db()->prepare('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)');
            $stmt->execute([$name, $email, $hashedPassword, 'agent']);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') {
                json_response(['error' => 'Email already exists'], 400);
            }
            throw $e;
        }

        $id = (int) db()->lastInsertId();
        $select = db()->prepare('SELECT id, name, email, role FROM users WHERE id = ? LIMIT 1');
        $select->execute([$id]);
        $user = $select->fetch();
        if (!$user) {
            json_response(['error' => 'Failed to create user'], 500);
        }

        ensure_employee_record_for_user($user);

        $safeUser = safe_user_from_row($user);
        $token = sign_token($safeUser);
        json_response(['token' => $token, 'user' => $safeUser]);
    }

    if ($route === 'twilio/voice/outbound' && $method === 'POST') {
        if (!twilio_validate_signature($route, $_POST)) {
            json_response(['error' => 'Forbidden'], 403);
        }

        $toRaw = (string) ($_POST['To'] ?? '');
        $fromRaw = (string) ($_POST['From'] ?? '');
        $callSid = trim((string) ($_POST['CallSid'] ?? ''));

        $normalizedTo = twilio_normalize_us_e164($toRaw);
        if ($normalizedTo === null) {
            $xml = '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Only US phone numbers are supported.</Say><Hangup/></Response>';
            twiml_response($xml, 200);
        }

        $callerId = twilio_normalize_us_e164((string) env('TWILIO_CALLER_ID', ''));
        if ($callerId === null) {
            $xml = '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Dialer is not configured.</Say><Hangup/></Response>';
            twiml_response($xml, 200);
        }

        $createdByUserId = twilio_parse_user_id_from_client($fromRaw);

        if ($callSid !== '') {
            $existingStmt = db()->prepare('SELECT id, created_by_user_id FROM calls WHERE twilio_parent_call_sid = ? LIMIT 1');
            $existingStmt->execute([$callSid]);
            $existing = $existingStmt->fetch();

            if ($existing) {
                $update = db()->prepare(
                    'UPDATE calls
                     SET contact_name = ?, phone_number = ?, status = ?, from_number = ?, to_number = ?, created_by_user_id = COALESCE(created_by_user_id, ?)
                     WHERE id = ?'
                );
                $update->execute([
                    'Outbound Call',
                    $normalizedTo,
                    'queued',
                    $fromRaw,
                    $normalizedTo,
                    $createdByUserId,
                    (int) $existing['id'],
                ]);
            } else {
                $insert = db()->prepare(
                    'INSERT INTO calls (
                        contact_name, phone_number, duration, status, twilio_parent_call_sid, from_number, to_number, created_by_user_id, started_at
                     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
                );
                $insert->execute([
                    'Outbound Call',
                    $normalizedTo,
                    0,
                    'queued',
                    $callSid,
                    $fromRaw,
                    $normalizedTo,
                    $createdByUserId,
                    gmdate('Y-m-d H:i:s'),
                ]);
            }
        }

        $statusCallbackUrl = twilio_webhook_url_for_route('twilio/call-status');
        $xml = '<?xml version="1.0" encoding="UTF-8"?>'
            . '<Response>'
            . '<Dial callerId="' . xml_escape($callerId) . '">'
            . '<Number statusCallback="' . xml_escape($statusCallbackUrl) . '" statusCallbackEvent="initiated ringing answered completed" statusCallbackMethod="POST">'
            . xml_escape($normalizedTo)
            . '</Number>'
            . '</Dial>'
            . '</Response>';
        twiml_response($xml, 200);
    }

    if ($route === 'twilio/call-status' && $method === 'POST') {
        if (!twilio_validate_signature($route, $_POST)) {
            json_response(['error' => 'Forbidden'], 403);
        }

        $callSid = trim((string) ($_POST['CallSid'] ?? ''));
        $parentCallSid = trim((string) ($_POST['ParentCallSid'] ?? ''));
        $statusRaw = (string) ($_POST['DialCallStatus'] ?? ($_POST['CallStatus'] ?? ''));
        $status = twilio_status_to_app_status($statusRaw);

        $toRaw = (string) ($_POST['To'] ?? '');
        $fromRaw = (string) ($_POST['From'] ?? '');
        $normalizedTo = twilio_normalize_us_e164($toRaw) ?? trim($toRaw);
        $normalizedFrom = twilio_normalize_us_e164($fromRaw) ?? trim($fromRaw);

        $duration = (int) ($_POST['CallDuration'] ?? ($_POST['DialCallDuration'] ?? 0));
        $errorCode = trim((string) ($_POST['ErrorCode'] ?? ''));
        $errorMessage = trim((string) ($_POST['ErrorMessage'] ?? ''));
        if (strlen($errorMessage) > 255) {
            $errorMessage = substr($errorMessage, 0, 255);
        }

        $createdByUserId = twilio_parse_user_id_from_client($fromRaw);
        $existing = null;

        if ($parentCallSid !== '') {
            $stmt = db()->prepare('SELECT * FROM calls WHERE twilio_parent_call_sid = ? LIMIT 1');
            $stmt->execute([$parentCallSid]);
            $existing = $stmt->fetch();
        }

        if (!$existing && $callSid !== '') {
            $stmt = db()->prepare('SELECT * FROM calls WHERE twilio_call_sid = ? LIMIT 1');
            $stmt->execute([$callSid]);
            $existing = $stmt->fetch();
        }

        $now = gmdate('Y-m-d H:i:s');
        if (!$existing) {
            $startedAt = in_array($status, ['queued', 'ringing', 'in-progress', 'completed', 'busy', 'failed', 'no-answer', 'canceled'], true) ? $now : null;
            $answeredAt = $status === 'in-progress' ? $now : null;
            $endedAt = twilio_is_terminal_status($status) ? $now : null;

            $insert = db()->prepare(
                'INSERT INTO calls (
                    contact_name, phone_number, duration, status, twilio_call_sid, twilio_parent_call_sid, from_number, to_number, created_by_user_id,
                    started_at, answered_at, ended_at, error_code, error_message
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $insert->execute([
                'Outbound Call',
                $normalizedTo,
                max(0, $duration),
                $status,
                $callSid !== '' ? $callSid : null,
                $parentCallSid !== '' ? $parentCallSid : null,
                $normalizedFrom !== '' ? $normalizedFrom : null,
                $normalizedTo !== '' ? $normalizedTo : null,
                $createdByUserId,
                $startedAt,
                $answeredAt,
                $endedAt,
                $errorCode !== '' ? $errorCode : null,
                $errorMessage !== '' ? $errorMessage : null,
            ]);
            json_response(['ok' => true]);
        }

        $startedAt = (string) ($existing['started_at'] ?? '');
        $answeredAt = (string) ($existing['answered_at'] ?? '');
        $endedAt = (string) ($existing['ended_at'] ?? '');

        if ($startedAt === '' && in_array($status, ['queued', 'ringing', 'in-progress', 'completed', 'busy', 'failed', 'no-answer', 'canceled'], true)) {
            $startedAt = $now;
        }
        if ($answeredAt === '' && $status === 'in-progress') {
            $answeredAt = $now;
        }
        if ($endedAt === '' && twilio_is_terminal_status($status)) {
            $endedAt = $now;
        }

        $resolvedDuration = max((int) ($existing['duration'] ?? 0), $duration);
        $resolvedFrom = $normalizedFrom !== '' ? $normalizedFrom : (string) ($existing['from_number'] ?? '');
        $resolvedTo = $normalizedTo !== '' ? $normalizedTo : (string) ($existing['to_number'] ?? '');
        $resolvedPhoneNumber = $normalizedTo !== '' ? $normalizedTo : (string) ($existing['phone_number'] ?? '');
        $resolvedCreatedBy = $existing['created_by_user_id'] !== null ? (int) $existing['created_by_user_id'] : $createdByUserId;

        $update = db()->prepare(
            'UPDATE calls
             SET contact_name = ?, phone_number = ?, duration = ?, status = ?, twilio_call_sid = ?, twilio_parent_call_sid = ?, from_number = ?, to_number = ?,
                 created_by_user_id = ?, started_at = ?, answered_at = ?, ended_at = ?, error_code = ?, error_message = ?
             WHERE id = ?'
        );
        $update->execute([
            (string) ($existing['contact_name'] ?? 'Outbound Call'),
            $resolvedPhoneNumber,
            $resolvedDuration,
            $status,
            $callSid !== '' ? $callSid : ($existing['twilio_call_sid'] ?? null),
            $parentCallSid !== '' ? $parentCallSid : ($existing['twilio_parent_call_sid'] ?? null),
            $resolvedFrom !== '' ? $resolvedFrom : null,
            $resolvedTo !== '' ? $resolvedTo : null,
            $resolvedCreatedBy,
            $startedAt !== '' ? $startedAt : null,
            $answeredAt !== '' ? $answeredAt : null,
            $endedAt !== '' ? $endedAt : null,
            $errorCode !== '' ? $errorCode : ($existing['error_code'] ?? null),
            $errorMessage !== '' ? $errorMessage : ($existing['error_message'] ?? null),
            (int) $existing['id'],
        ]);

        json_response(['ok' => true]);
    }

    // Protected endpoints below.
    $authUser = require_auth_user();
    $authUserId = (int) ($authUser['id'] ?? 0);
    $authRole = strtolower((string) ($authUser['role'] ?? 'agent'));
    $canViewAllCalls = in_array($authRole, ['admin', 'manager'], true);
    $normalizeActivityRow = static function (array $row): array {
        $row['id'] = (int) ($row['id'] ?? 0);
        $row['user_id'] = (int) ($row['user_id'] ?? 0);
        $row['completed'] = ((int) ($row['completed'] ?? 0)) === 1;
        return $row;
    };

    if ($route === 'twilio/access-token' && $method === 'POST') {
        $userId = $authUserId;
        if ($userId <= 0) {
            json_response(['error' => 'Invalid auth context'], 401);
        }

        $identity = 'user_' . $userId;
        $token = twilio_build_access_token($identity);
        json_response([
            'token' => $token,
            'identity' => $identity,
            'expiresIn' => twilio_access_token_ttl_seconds(),
        ]);
    }

    if ($route === 'telnyx/access-token' && $method === 'POST') {
        if ($authUserId <= 0) {
            json_response(['error' => 'Invalid auth context'], 401);
        }

        try {
            $result = telnyx_issue_access_token();
            json_response([
                'token' => (string) ($result['token'] ?? ''),
                'callerNumber' => (string) ($result['caller_number'] ?? ''),
                'callerNumbers' => array_values(array_filter(
                    is_array($result['caller_numbers'] ?? null) ? $result['caller_numbers'] : [],
                    static fn ($value): bool => is_string($value) && trim($value) !== ''
                )),
                'expiresAt' => (string) ($result['expires_at'] ?? ''),
                'expiresIn' => (int) ($result['expires_in'] ?? 0),
            ]);
        } catch (RuntimeException $e) {
            json_response(['error' => $e->getMessage()], 503);
        } catch (Throwable $e) {
            json_response(['error' => 'Unable to initialize Telnyx dialer'], 502);
        }
    }

    if ($route === 'users' && $method === 'GET') {
        if (!str_contains($authRole, 'admin')) {
            json_response(['error' => 'Forbidden'], 403);
        }

        $stmt = db()->query('SELECT id, name, email, role FROM users ORDER BY name ASC, email ASC');
        $rows = $stmt->fetchAll();
        $payload = [];
        foreach ($rows as $row) {
            $payload[] = safe_user_from_row($row);
        }

        json_response($payload);
    }

    if ($route === 'presence' && $method === 'GET') {
        collapse_duplicate_employee_rows();
        $supportsActiveCallerNumber = user_presence_supports_active_caller_number();
        $stmt = db()->query(
            'SELECT
                p.user_id,
                p.email,
                p.name,
                p.role,
                p.status,
                p.custom_message,
                p.is_on_call,
                ' . ($supportsActiveCallerNumber ? 'p.active_caller_number' : 'NULL AS active_caller_number') . ',
                p.last_seen,
                p.last_offline_at,
                p.updated_at,
                e.id AS employee_id,
                e.name AS employee_name,
                e.email AS employee_email,
                e.role AS employee_role,
                e.status AS employee_status,
                e.contact_info AS employee_contact_info
             FROM user_presence p
             LEFT JOIN employees e ON LOWER(e.email) = LOWER(p.email)
             ORDER BY p.last_seen DESC'
        );
        $rows = $stmt->fetchAll();

        $payload = array_map(static function (array $row): array {
            $online = is_presence_online((string) ($row['status'] ?? ''), (string) ($row['last_seen'] ?? ''));
            $status = $online ? normalize_presence_status((string) ($row['status'] ?? 'available')) : 'offline';

            $employeeEmail = trim((string) ($row['employee_email'] ?? ''));
            $presenceEmail = trim((string) ($row['email'] ?? ''));
            $effectiveEmail = $employeeEmail !== '' ? $employeeEmail : $presenceEmail;

            $employeeName = trim((string) ($row['employee_name'] ?? ''));
            $presenceName = trim((string) ($row['name'] ?? ''));
            $effectiveName = $employeeName !== '' ? $employeeName : $presenceName;

            $employeeRole = trim((string) ($row['employee_role'] ?? ''));
            $presenceRole = trim((string) ($row['role'] ?? ''));
            $effectiveRole = $employeeRole !== '' ? $employeeRole : $presenceRole;

            return [
                'user_id' => (int) ($row['user_id'] ?? 0),
                'email' => $presenceEmail,
                'name' => $presenceName,
                'status' => $status,
                'custom_message' => (string) ($row['custom_message'] ?? ''),
                'is_on_call' => ((int) ($row['is_on_call'] ?? 0)) === 1,
                'active_caller_number' => trim((string) ($row['active_caller_number'] ?? '')) ?: null,
                'last_activity' => (string) ($row['last_seen'] ?? ''),
                'last_seen' => (string) ($row['last_seen'] ?? ''),
                'is_online' => $online,
                'employee' => [
                    'id' => isset($row['employee_id']) ? (int) $row['employee_id'] : null,
                    'full_name' => $effectiveName,
                    'email' => $effectiveEmail,
                    'assigned_color' => '#3B82F6',
                    'role' => $effectiveRole,
                    'status' => (string) ($row['employee_status'] ?? 'active'),
                    'contact_info' => (string) ($row['employee_contact_info'] ?? ''),
                ],
            ];
        }, $rows);

        json_response($payload);
    }

    if ($route === 'presence/heartbeat' && $method === 'POST') {
        $input = read_json_body();
        $status = normalize_presence_status((string) ($input['status'] ?? 'available'));
        if ($status === 'offline') {
            $status = 'away';
        }
        $customMessage = trim((string) ($input['custom_message'] ?? ''));
        if (strlen($customMessage) > 500) {
            $customMessage = substr($customMessage, 0, 500);
        }

        $isOnCallInput = $input['is_on_call'] ?? false;
        $isOnCall = false;
        if (is_bool($isOnCallInput)) {
            $isOnCall = $isOnCallInput;
        } else {
            $isOnCall = in_array(strtolower((string) $isOnCallInput), ['1', 'true', 'yes', 'on'], true);
        }
        $activeCallerNumber = telnyx_normalize_phone_number((string) ($input['active_caller_number'] ?? ''));
        if (!$isOnCall) {
            $activeCallerNumber = '';
        }

        $presenceName = trim((string) ($authUser['name'] ?? ''));
        if ($presenceName === '') {
            $presenceName = explode('@', (string) ($authUser['email'] ?? ''))[0] ?? 'User';
        }
        $presenceRole = normalize_employee_role_from_user_role((string) ($authUser['role'] ?? 'agent'));
        $presenceEmail = strtolower(trim((string) ($authUser['email'] ?? '')));
        if ($presenceEmail === '') {
            json_response(['error' => 'Invalid auth context'], 401);
        }

        if (user_presence_supports_active_caller_number()) {
            $stmt = db()->prepare(
                'INSERT INTO user_presence (
                    user_id, email, name, role, status, custom_message, is_on_call, active_caller_number, last_seen, last_offline_at, created_at, updated_at
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NULL, NOW(), NOW())
                 ON DUPLICATE KEY UPDATE
                    email = VALUES(email),
                    name = VALUES(name),
                    role = VALUES(role),
                    status = VALUES(status),
                    custom_message = VALUES(custom_message),
                    is_on_call = VALUES(is_on_call),
                    active_caller_number = VALUES(active_caller_number),
                    last_seen = NOW(),
                    last_offline_at = NULL,
                    updated_at = NOW()'
            );
            $stmt->execute([
                $authUserId,
                $presenceEmail,
                $presenceName,
                $presenceRole,
                $status,
                $customMessage !== '' ? $customMessage : null,
                $isOnCall ? 1 : 0,
                $activeCallerNumber !== '' ? $activeCallerNumber : null,
            ]);
        } else {
            $stmt = db()->prepare(
                'INSERT INTO user_presence (
                    user_id, email, name, role, status, custom_message, is_on_call, last_seen, last_offline_at, created_at, updated_at
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NULL, NOW(), NOW())
                 ON DUPLICATE KEY UPDATE
                    email = VALUES(email),
                    name = VALUES(name),
                    role = VALUES(role),
                    status = VALUES(status),
                    custom_message = VALUES(custom_message),
                    is_on_call = VALUES(is_on_call),
                    last_seen = NOW(),
                    last_offline_at = NULL,
                    updated_at = NOW()'
            );
            $stmt->execute([
                $authUserId,
                $presenceEmail,
                $presenceName,
                $presenceRole,
                $status,
                $customMessage !== '' ? $customMessage : null,
                $isOnCall ? 1 : 0,
            ]);
        }

        json_response(['success' => true]);
    }

    if ($route === 'presence/offline' && $method === 'POST') {
        $presenceName = trim((string) ($authUser['name'] ?? ''));
        if ($presenceName === '') {
            $presenceName = explode('@', (string) ($authUser['email'] ?? ''))[0] ?? 'User';
        }
        $presenceRole = normalize_employee_role_from_user_role((string) ($authUser['role'] ?? 'agent'));
        $presenceEmail = strtolower(trim((string) ($authUser['email'] ?? '')));
        if ($presenceEmail === '') {
            json_response(['error' => 'Invalid auth context'], 401);
        }

        if (user_presence_supports_active_caller_number()) {
            $stmt = db()->prepare(
                'INSERT INTO user_presence (
                    user_id, email, name, role, status, custom_message, is_on_call, active_caller_number, last_seen, last_offline_at, created_at, updated_at
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NOW(), NOW(), NOW(), NOW())
                 ON DUPLICATE KEY UPDATE
                    email = VALUES(email),
                    name = VALUES(name),
                    role = VALUES(role),
                    status = VALUES(status),
                    custom_message = NULL,
                    is_on_call = 0,
                    active_caller_number = NULL,
                    last_offline_at = NOW(),
                    updated_at = NOW()'
            );
            $stmt->execute([
                $authUserId,
                $presenceEmail,
                $presenceName,
                $presenceRole,
                'offline',
                null,
                0,
            ]);
        } else {
            $stmt = db()->prepare(
                'INSERT INTO user_presence (
                    user_id, email, name, role, status, custom_message, is_on_call, last_seen, last_offline_at, created_at, updated_at
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW(), NOW())
                 ON DUPLICATE KEY UPDATE
                    email = VALUES(email),
                    name = VALUES(name),
                    role = VALUES(role),
                    status = VALUES(status),
                    custom_message = NULL,
                    is_on_call = 0,
                    last_offline_at = NOW(),
                    updated_at = NOW()'
            );
            $stmt->execute([
                $authUserId,
                $presenceEmail,
                $presenceName,
                $presenceRole,
                'offline',
                null,
                0,
            ]);
        }

        json_response(['success' => true]);
    }

    if ($route === 'activities' && $method === 'GET') {
        $targetUserId = $authUserId;
        if (isset($_GET['user_id'])) {
            $requestedUserId = (int) $_GET['user_id'];
            if ($requestedUserId > 0) {
                $targetUserId = $requestedUserId;
            }
        }

        if (!$canViewAllCalls && $targetUserId !== $authUserId) {
            json_response(['error' => 'Forbidden'], 403);
        }

        $stmt = db()->prepare(
            'SELECT *
             FROM activities
             WHERE user_id = ?
             ORDER BY due_date IS NULL ASC, due_date ASC, created_at DESC'
        );
        $stmt->execute([$targetUserId]);
        $rows = $stmt->fetchAll();
        $rows = array_map($normalizeActivityRow, $rows);
        json_response($rows);
    }

    if ($route === 'activities' && $method === 'POST') {
        $input = read_json_body();
        $userId = isset($input['user_id']) ? (int) $input['user_id'] : $authUserId;
        if ($userId <= 0) {
            json_response(['error' => 'Invalid user'], 400);
        }
        if (!$canViewAllCalls && $userId !== $authUserId) {
            json_response(['error' => 'Forbidden'], 403);
        }

        $title = trim((string) ($input['title'] ?? ''));
        if ($title === '') {
            json_response(['error' => 'Activity title is required'], 400);
        }

        $dueDate = null;
        $dueDateRaw = trim((string) ($input['due_date'] ?? ''));
        if ($dueDateRaw !== '') {
            try {
                $dueDate = (new DateTimeImmutable($dueDateRaw))->format('Y-m-d H:i:s');
            } catch (Throwable $e) {
                json_response(['error' => 'Invalid due_date'], 400);
            }
        }

        $completedRaw = $input['completed'] ?? false;
        if (is_bool($completedRaw)) {
            $completed = $completedRaw ? 1 : 0;
        } else {
            $completed = in_array(strtolower((string) $completedRaw), ['1', 'true', 'yes', 'on'], true) ? 1 : 0;
        }

        $stmt = db()->prepare(
            'INSERT INTO activities (
                user_id, related_to_type, related_to_id, type, title, description, due_date, completed, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())'
        );
        $stmt->execute([
            $userId,
            trim((string) ($input['related_to_type'] ?? 'contact')) ?: 'contact',
            trim((string) ($input['related_to_id'] ?? '')) ?: null,
            trim((string) ($input['type'] ?? 'task')) ?: 'task',
            $title,
            trim((string) ($input['description'] ?? '')) ?: null,
            $dueDate,
            $completed,
        ]);

        $id = (int) db()->lastInsertId();
        $select = db()->prepare('SELECT * FROM activities WHERE id = ? LIMIT 1');
        $select->execute([$id]);
        $row = $select->fetch();
        if (!$row) {
            json_response(['error' => 'Failed to create activity'], 500);
        }
        $normalizedRow = $normalizeActivityRow($row);
        json_response(['id' => $id, 'row' => $normalizedRow, 'data' => $normalizedRow]);
    }

    if (preg_match('#^activities/(\d+)$#', $route, $matches) === 1 && $method === 'PUT') {
        $id = (int) $matches[1];
        $input = read_json_body();

        $check = db()->prepare('SELECT user_id FROM activities WHERE id = ? LIMIT 1');
        $check->execute([$id]);
        $existing = $check->fetch();
        if (!$existing) {
            json_response(['error' => 'Activity not found'], 404);
        }
        $ownerUserId = (int) ($existing['user_id'] ?? 0);
        if (!$canViewAllCalls && $ownerUserId !== $authUserId) {
            json_response(['error' => 'Forbidden'], 403);
        }

        $fields = [];
        $params = [];

        if (array_key_exists('user_id', $input)) {
            $userId = (int) $input['user_id'];
            if ($userId <= 0) {
                json_response(['error' => 'Invalid user'], 400);
            }
            if (!$canViewAllCalls && $userId !== $authUserId) {
                json_response(['error' => 'Forbidden'], 403);
            }
            $fields[] = 'user_id = ?';
            $params[] = $userId;
        }
        if (array_key_exists('related_to_type', $input)) {
            $fields[] = 'related_to_type = ?';
            $params[] = trim((string) ($input['related_to_type'] ?? 'contact')) ?: 'contact';
        }
        if (array_key_exists('related_to_id', $input)) {
            $fields[] = 'related_to_id = ?';
            $params[] = trim((string) ($input['related_to_id'] ?? '')) ?: null;
        }
        if (array_key_exists('type', $input)) {
            $fields[] = 'type = ?';
            $params[] = trim((string) ($input['type'] ?? 'task')) ?: 'task';
        }
        if (array_key_exists('title', $input)) {
            $title = trim((string) ($input['title'] ?? ''));
            if ($title === '') {
                json_response(['error' => 'Activity title is required'], 400);
            }
            $fields[] = 'title = ?';
            $params[] = $title;
        }
        if (array_key_exists('description', $input)) {
            $fields[] = 'description = ?';
            $params[] = trim((string) ($input['description'] ?? '')) ?: null;
        }
        if (array_key_exists('due_date', $input)) {
            $dueDateRaw = trim((string) ($input['due_date'] ?? ''));
            if ($dueDateRaw === '') {
                $fields[] = 'due_date = ?';
                $params[] = null;
            } else {
                try {
                    $dueDate = (new DateTimeImmutable($dueDateRaw))->format('Y-m-d H:i:s');
                } catch (Throwable $e) {
                    json_response(['error' => 'Invalid due_date'], 400);
                }
                $fields[] = 'due_date = ?';
                $params[] = $dueDate;
            }
        }
        if (array_key_exists('completed', $input)) {
            $completedRaw = $input['completed'];
            if (is_bool($completedRaw)) {
                $completed = $completedRaw ? 1 : 0;
            } else {
                $completed = in_array(strtolower((string) $completedRaw), ['1', 'true', 'yes', 'on'], true) ? 1 : 0;
            }
            $fields[] = 'completed = ?';
            $params[] = $completed;
        }

        if (count($fields) === 0) {
            json_response(['error' => 'No updatable fields provided'], 400);
        }

        $params[] = $id;
        $sql = 'UPDATE activities SET ' . implode(', ', $fields) . ', updated_at = NOW() WHERE id = ?';
        $stmt = db()->prepare($sql);
        $stmt->execute($params);

        $select = db()->prepare('SELECT * FROM activities WHERE id = ? LIMIT 1');
        $select->execute([$id]);
        $row = $select->fetch();
        if (!$row) {
            json_response(['error' => 'Activity not found'], 404);
        }
        $normalizedRow = $normalizeActivityRow($row);
        json_response(['success' => true, 'row' => $normalizedRow, 'data' => $normalizedRow]);
    }

    if (preg_match('#^activities/(\d+)$#', $route, $matches) === 1 && $method === 'DELETE') {
        $id = (int) $matches[1];
        $check = db()->prepare('SELECT user_id FROM activities WHERE id = ? LIMIT 1');
        $check->execute([$id]);
        $existing = $check->fetch();
        if (!$existing) {
            json_response(['error' => 'Activity not found'], 404);
        }
        $ownerUserId = (int) ($existing['user_id'] ?? 0);
        if (!$canViewAllCalls && $ownerUserId !== $authUserId) {
            json_response(['error' => 'Forbidden'], 403);
        }

        $stmt = db()->prepare('DELETE FROM activities WHERE id = ?');
        $stmt->execute([$id]);
        json_response(['success' => true]);
    }

    if ($route === 'messages/conversations' && $method === 'GET') {
        ensure_default_messages_conversation();
        ensure_direct_message_conversations_for_user($authUserId);

        $conversationsStmt = db()->prepare(
            'SELECT
                c.id,
                c.name,
                c.is_group,
                c.updated_at,
                cp.last_read_at,
                (
                    SELECT COUNT(*)
                    FROM conversation_participants cp2
                    WHERE cp2.conversation_id = c.id
                ) AS participant_count,
                (
                    SELECT m.content
                    FROM messages m
                    WHERE m.conversation_id = c.id
                    ORDER BY m.created_at DESC, m.id DESC
                    LIMIT 1
                ) AS last_message,
                (
                    SELECT m.created_at
                    FROM messages m
                    WHERE m.conversation_id = c.id
                    ORDER BY m.created_at DESC, m.id DESC
                    LIMIT 1
                ) AS last_message_at,
                (
                    SELECT cp2.user_id
                    FROM conversation_participants cp2
                    WHERE
                        cp2.conversation_id = c.id
                        AND cp2.user_id <> ?
                    ORDER BY cp2.user_id ASC
                    LIMIT 1
                ) AS other_user_id,
                (
                    SELECT COALESCE(u.name, "User")
                    FROM conversation_participants cp2
                    LEFT JOIN users u ON u.id = cp2.user_id
                    WHERE
                        cp2.conversation_id = c.id
                        AND cp2.user_id <> ?
                    ORDER BY cp2.user_id ASC
                    LIMIT 1
                ) AS other_user_name,
                (
                    SELECT up.status
                    FROM conversation_participants cp2
                    LEFT JOIN user_presence up ON up.user_id = cp2.user_id
                    WHERE
                        cp2.conversation_id = c.id
                        AND cp2.user_id <> ?
                    ORDER BY cp2.user_id ASC
                    LIMIT 1
                ) AS other_user_presence_status,
                (
                    SELECT up.last_seen
                    FROM conversation_participants cp2
                    LEFT JOIN user_presence up ON up.user_id = cp2.user_id
                    WHERE
                        cp2.conversation_id = c.id
                        AND cp2.user_id <> ?
                    ORDER BY cp2.user_id ASC
                    LIMIT 1
                ) AS other_user_last_seen
             FROM conversations c
             INNER JOIN conversation_participants cp
                ON cp.conversation_id = c.id
             WHERE cp.user_id = ?
             ORDER BY
                c.is_group DESC,
                COALESCE(last_message_at, c.updated_at) DESC,
                c.id DESC'
        );
        $conversationsStmt->execute([$authUserId, $authUserId, $authUserId, $authUserId, $authUserId]);
        $rows = $conversationsStmt->fetchAll();

        $unreadStmt = db()->prepare(
            'SELECT
                m.conversation_id,
                COUNT(*) AS unread_count
             FROM messages m
             INNER JOIN conversation_participants cp
                ON cp.conversation_id = m.conversation_id
             WHERE
                cp.user_id = ?
                AND m.sender_user_id <> ?
                AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at)
             GROUP BY m.conversation_id'
        );
        $unreadStmt->execute([$authUserId, $authUserId]);
        $unreadRows = $unreadStmt->fetchAll();
        $unreadByConversation = [];
        foreach ($unreadRows as $unreadRow) {
            $unreadByConversation[(int) ($unreadRow['conversation_id'] ?? 0)] = (int) ($unreadRow['unread_count'] ?? 0);
        }

        $payload = [];
        foreach ($rows as $row) {
            $conversationId = (int) ($row['id'] ?? 0);
            if ($conversationId <= 0) {
                continue;
            }

            $isGroup = ((int) ($row['is_group'] ?? 1)) === 1;
            $otherUserId = (int) ($row['other_user_id'] ?? 0);
            $otherUserName = trim((string) ($row['other_user_name'] ?? ''));
            $otherUserStatus = normalize_presence_status((string) ($row['other_user_presence_status'] ?? 'offline'));
            $otherUserLastSeen = $row['other_user_last_seen'] !== null ? (string) $row['other_user_last_seen'] : null;
            if (!$isGroup && !is_presence_online($otherUserStatus, $otherUserLastSeen)) {
                $otherUserStatus = 'offline';
            }

            $conversationName = (string) ($row['name'] ?? 'Conversation');
            if (!$isGroup && $otherUserName !== '') {
                $conversationName = $otherUserName;
            }

            $payload[] = [
                'id' => $conversationId,
                'name' => $conversationName,
                'is_group' => $isGroup,
                'participant_count' => (int) ($row['participant_count'] ?? 0),
                'last_message' => $row['last_message'] !== null ? (string) $row['last_message'] : null,
                'last_message_at' => $row['last_message_at'] !== null ? (string) $row['last_message_at'] : null,
                'updated_at' => (string) ($row['updated_at'] ?? ''),
                'unread_count' => $unreadByConversation[$conversationId] ?? 0,
                'other_user' => !$isGroup && $otherUserId > 0
                    ? [
                        'id' => $otherUserId,
                        'name' => $otherUserName !== '' ? $otherUserName : $conversationName,
                        'status' => $otherUserStatus,
                    ]
                    : null,
            ];
        }

        json_response($payload);
    }

    if (preg_match('#^messages/conversations/(\d+)/messages$#', $route, $matches) === 1 && $method === 'GET') {
        ensure_default_messages_conversation();

        $conversationId = (int) $matches[1];
        if (!user_can_access_conversation($conversationId, $authUserId)) {
            json_response(['error' => 'Conversation not found'], 404);
        }

        $messagesStmt = db()->prepare(
            'SELECT
                m.id,
                m.conversation_id,
                m.sender_user_id,
                m.content,
                m.created_at,
                COALESCE(u.name, "User") AS sender_name
             FROM messages m
             LEFT JOIN users u ON u.id = m.sender_user_id
             WHERE m.conversation_id = ?
             ORDER BY m.created_at ASC, m.id ASC
             LIMIT 500'
        );
        $messagesStmt->execute([$conversationId]);
        $rows = $messagesStmt->fetchAll();

        $markRead = db()->prepare(
            'UPDATE conversation_participants
             SET last_read_at = NOW()
             WHERE conversation_id = ? AND user_id = ?'
        );
        $markRead->execute([$conversationId, $authUserId]);

        $payload = [];
        foreach ($rows as $row) {
            $payload[] = [
                'id' => (int) ($row['id'] ?? 0),
                'conversation_id' => (int) ($row['conversation_id'] ?? 0),
                'sender_user_id' => (int) ($row['sender_user_id'] ?? 0),
                'sender_name' => (string) ($row['sender_name'] ?? 'User'),
                'content' => (string) ($row['content'] ?? ''),
                'created_at' => (string) ($row['created_at'] ?? ''),
            ];
        }

        json_response($payload);
    }

    if (preg_match('#^messages/conversations/(\d+)/messages$#', $route, $matches) === 1 && $method === 'POST') {
        ensure_default_messages_conversation();

        $conversationId = (int) $matches[1];
        if (!user_can_access_conversation($conversationId, $authUserId)) {
            json_response(['error' => 'Conversation not found'], 404);
        }

        $input = read_json_body();
        $content = trim((string) ($input['content'] ?? ''));
        if ($content === '') {
            json_response(['error' => 'Message content is required'], 400);
        }

        $contentLength = function_exists('mb_strlen') ? mb_strlen($content, 'UTF-8') : strlen($content);
        if ($contentLength > 4000) {
            json_response(['error' => 'Message is too long'], 400);
        }

        $insert = db()->prepare(
            'INSERT INTO messages (conversation_id, sender_user_id, content, created_at)
             VALUES (?, ?, ?, NOW())'
        );
        $insert->execute([$conversationId, $authUserId, $content]);
        $messageId = (int) db()->lastInsertId();

        $touchConversation = db()->prepare('UPDATE conversations SET updated_at = NOW() WHERE id = ?');
        $touchConversation->execute([$conversationId]);

        $markRead = db()->prepare(
            'UPDATE conversation_participants
             SET last_read_at = NOW()
             WHERE conversation_id = ? AND user_id = ?'
        );
        $markRead->execute([$conversationId, $authUserId]);

        $select = db()->prepare(
            'SELECT
                m.id,
                m.conversation_id,
                m.sender_user_id,
                m.content,
                m.created_at,
                COALESCE(u.name, "User") AS sender_name
             FROM messages m
             LEFT JOIN users u ON u.id = m.sender_user_id
             WHERE m.id = ?
             LIMIT 1'
        );
        $select->execute([$messageId]);
        $row = $select->fetch();
        if (!$row) {
            json_response(['error' => 'Failed to create message'], 500);
        }

        json_response([
            'id' => (int) ($row['id'] ?? 0),
            'conversation_id' => (int) ($row['conversation_id'] ?? 0),
            'sender_user_id' => (int) ($row['sender_user_id'] ?? 0),
            'sender_name' => (string) ($row['sender_name'] ?? 'User'),
            'content' => (string) ($row['content'] ?? ''),
            'created_at' => (string) ($row['created_at'] ?? ''),
        ]);
    }

    if ($route === 'contacts' && $method === 'GET') {
        $rows = db()->query('SELECT * FROM contacts ORDER BY id DESC')->fetchAll();
        json_response($rows);
    }

    if ($route === 'contacts' && $method === 'POST') {
        $input = read_json_body();
        $firstName = trim((string) ($input['first_name'] ?? ''));
        $lastName = trim((string) ($input['last_name'] ?? ''));
        $name = trim((string) ($input['name'] ?? trim($firstName . ' ' . $lastName)));
        if ($name === '') {
            json_response(['error' => 'Contact name is required'], 400);
        }

        $company = trim((string) ($input['company'] ?? ''));
        $companyId = isset($input['company_id']) && $input['company_id'] !== '' ? (int) $input['company_id'] : null;
        $email = trim((string) ($input['email'] ?? ''));
        $phone = trim((string) ($input['phone'] ?? ''));
        $assignedTo = trim((string) ($input['assigned_to'] ?? ''));
        $status = trim((string) ($input['status'] ?? 'active'));
        $position = trim((string) ($input['position'] ?? ''));
        $notes = trim((string) ($input['notes'] ?? ''));

        $stmt = db()->prepare(
            'INSERT INTO contacts (name, first_name, last_name, company, company_id, email, phone, assigned_to, status, position, notes, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())'
        );
        $stmt->execute([
            $name,
            $firstName !== '' ? $firstName : null,
            $lastName !== '' ? $lastName : null,
            $company !== '' ? $company : null,
            $companyId,
            $email !== '' ? $email : null,
            $phone !== '' ? $phone : null,
            $assignedTo !== '' ? $assignedTo : null,
            $status !== '' ? $status : 'active',
            $position !== '' ? $position : null,
            $notes !== '' ? $notes : null,
        ]);

        $id = (int) db()->lastInsertId();
        $select = db()->prepare('SELECT * FROM contacts WHERE id = ? LIMIT 1');
        $select->execute([$id]);
        $row = $select->fetch();
        json_response(['id' => $id, 'row' => $row]);
    }

    if (preg_match('#^contacts/(\d+)$#', $route, $matches) === 1 && $method === 'PUT') {
        $id = (int) $matches[1];
        $input = read_json_body();
        $firstName = trim((string) ($input['first_name'] ?? ''));
        $lastName = trim((string) ($input['last_name'] ?? ''));
        $name = trim((string) ($input['name'] ?? trim($firstName . ' ' . $lastName)));
        if ($name === '') {
            $existingStmt = db()->prepare('SELECT name FROM contacts WHERE id = ? LIMIT 1');
            $existingStmt->execute([$id]);
            $existing = $existingStmt->fetch();
            $name = (string) ($existing['name'] ?? '');
        }
        if ($name === '') {
            json_response(['error' => 'Contact name is required'], 400);
        }

        $company = trim((string) ($input['company'] ?? ''));
        $companyId = isset($input['company_id']) && $input['company_id'] !== '' ? (int) $input['company_id'] : null;
        $email = trim((string) ($input['email'] ?? ''));
        $phone = trim((string) ($input['phone'] ?? ''));
        $assignedTo = trim((string) ($input['assigned_to'] ?? ''));
        $status = trim((string) ($input['status'] ?? 'active'));
        $position = trim((string) ($input['position'] ?? ''));
        $notes = trim((string) ($input['notes'] ?? ''));

        $stmt = db()->prepare(
            'UPDATE contacts
             SET name = ?, first_name = ?, last_name = ?, company = ?, company_id = ?, email = ?, phone = ?, assigned_to = ?, status = ?, position = ?, notes = ?, updated_at = NOW()
             WHERE id = ?'
        );
        $stmt->execute([
            $name,
            $firstName !== '' ? $firstName : null,
            $lastName !== '' ? $lastName : null,
            $company !== '' ? $company : null,
            $companyId,
            $email !== '' ? $email : null,
            $phone !== '' ? $phone : null,
            $assignedTo !== '' ? $assignedTo : null,
            $status !== '' ? $status : 'active',
            $position !== '' ? $position : null,
            $notes !== '' ? $notes : null,
            $id,
        ]);
        if ($stmt->rowCount() === 0) {
            json_response(['error' => 'Contact not found'], 404);
        }

        $select = db()->prepare('SELECT * FROM contacts WHERE id = ? LIMIT 1');
        $select->execute([$id]);
        $row = $select->fetch();
        json_response(['success' => true, 'row' => $row]);
    }

    if (preg_match('#^contacts/(\d+)$#', $route, $matches) === 1 && $method === 'DELETE') {
        $id = (int) $matches[1];
        $stmt = db()->prepare('DELETE FROM contacts WHERE id = ?');
        $stmt->execute([$id]);
        if ($stmt->rowCount() === 0) {
            json_response(['error' => 'Contact not found'], 404);
        }
        json_response(['success' => true]);
    }

    if ($route === 'companies' && $method === 'GET') {
        $sql = 'SELECT c.*,
                    (SELECT COUNT(*) FROM contacts ct WHERE ct.company_id = c.id) AS contact_count
                FROM companies c
                ORDER BY c.id DESC';
        $rows = db()->query($sql)->fetchAll();
        json_response($rows);
    }

    if ($route === 'companies' && $method === 'POST') {
        $input = read_json_body();
        $name = trim((string) ($input['name'] ?? ''));
        if ($name === '') {
            json_response(['error' => 'Company name is required'], 400);
        }

        $stmt = db()->prepare(
            'INSERT INTO companies (name, website, industry, size, phone, address, notes, created_by_user_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())'
        );
        $stmt->execute([
            $name,
            trim((string) ($input['website'] ?? '')) ?: null,
            trim((string) ($input['industry'] ?? '')) ?: null,
            trim((string) ($input['size'] ?? '')) ?: null,
            trim((string) ($input['phone'] ?? '')) ?: null,
            trim((string) ($input['address'] ?? '')) ?: null,
            trim((string) ($input['notes'] ?? '')) ?: null,
            $authUserId > 0 ? $authUserId : null,
        ]);
        $id = (int) db()->lastInsertId();
        $select = db()->prepare('SELECT * FROM companies WHERE id = ? LIMIT 1');
        $select->execute([$id]);
        $row = $select->fetch();
        json_response(['id' => $id, 'row' => $row]);
    }

    if (preg_match('#^companies/(\d+)$#', $route, $matches) === 1 && $method === 'PUT') {
        $id = (int) $matches[1];
        $input = read_json_body();
        $name = trim((string) ($input['name'] ?? ''));
        if ($name === '') {
            json_response(['error' => 'Company name is required'], 400);
        }

        $stmt = db()->prepare(
            'UPDATE companies
             SET name = ?, website = ?, industry = ?, size = ?, phone = ?, address = ?, notes = ?, updated_at = NOW()
             WHERE id = ?'
        );
        $stmt->execute([
            $name,
            trim((string) ($input['website'] ?? '')) ?: null,
            trim((string) ($input['industry'] ?? '')) ?: null,
            trim((string) ($input['size'] ?? '')) ?: null,
            trim((string) ($input['phone'] ?? '')) ?: null,
            trim((string) ($input['address'] ?? '')) ?: null,
            trim((string) ($input['notes'] ?? '')) ?: null,
            $id,
        ]);
        if ($stmt->rowCount() === 0) {
            json_response(['error' => 'Company not found'], 404);
        }
        json_response(['success' => true]);
    }

    if (preg_match('#^companies/(\d+)$#', $route, $matches) === 1 && $method === 'DELETE') {
        $id = (int) $matches[1];
        $stmt = db()->prepare('DELETE FROM companies WHERE id = ?');
        $stmt->execute([$id]);
        if ($stmt->rowCount() === 0) {
            json_response(['error' => 'Company not found'], 404);
        }
        json_response(['success' => true]);
    }

    if ($route === 'deals' && $method === 'GET') {
        $rows = db()->query(
            'SELECT d.*, c.first_name, c.last_name, c.name AS contact_name_raw, co.name AS company_name
             FROM deals d
             LEFT JOIN contacts c ON c.id = d.contact_id
             LEFT JOIN companies co ON co.id = d.company_id
             ORDER BY d.id DESC'
        )->fetchAll();

        $mapped = array_map(static function (array $row): array {
            $firstName = trim((string) ($row['first_name'] ?? ''));
            $lastName = trim((string) ($row['last_name'] ?? ''));
            $fullName = trim($firstName . ' ' . $lastName);
            $row['contact_name'] = $fullName !== '' ? $fullName : (string) ($row['contact_name_raw'] ?? '');
            unset($row['contact_name_raw']);
            return $row;
        }, $rows);

        json_response($mapped);
    }

    if ($route === 'deals' && $method === 'POST') {
        $input = read_json_body();
        $title = trim((string) ($input['title'] ?? ''));
        if ($title === '') {
            json_response(['error' => 'Deal title is required'], 400);
        }

        $stmt = db()->prepare(
            'INSERT INTO deals (title, value, stage, probability, expected_close_date, contact_id, company_id, notes, created_by_user_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())'
        );
        $stmt->execute([
            $title,
            (float) ($input['value'] ?? 0),
            trim((string) ($input['stage'] ?? 'lead')) ?: 'lead',
            (int) ($input['probability'] ?? 0),
            trim((string) ($input['expected_close_date'] ?? '')) ?: null,
            isset($input['contact_id']) && $input['contact_id'] !== '' ? (int) $input['contact_id'] : null,
            isset($input['company_id']) && $input['company_id'] !== '' ? (int) $input['company_id'] : null,
            trim((string) ($input['notes'] ?? '')) ?: null,
            $authUserId > 0 ? $authUserId : null,
        ]);
        $id = (int) db()->lastInsertId();
        json_response(['id' => $id]);
    }

    if (preg_match('#^deals/(\d+)$#', $route, $matches) === 1 && $method === 'PUT') {
        $id = (int) $matches[1];
        $input = read_json_body();
        $existingStmt = db()->prepare('SELECT * FROM deals WHERE id = ? LIMIT 1');
        $existingStmt->execute([$id]);
        $existing = $existingStmt->fetch();
        if (!$existing) {
            json_response(['error' => 'Deal not found'], 404);
        }

        $title = trim((string) ($input['title'] ?? (string) ($existing['title'] ?? '')));
        if ($title === '') {
            json_response(['error' => 'Deal title is required'], 400);
        }
        $value = array_key_exists('value', $input) ? (float) $input['value'] : (float) ($existing['value'] ?? 0);
        $stage = trim((string) ($input['stage'] ?? (string) ($existing['stage'] ?? 'lead'))) ?: 'lead';
        $probability = array_key_exists('probability', $input) ? (int) $input['probability'] : (int) ($existing['probability'] ?? 0);
        $expectedCloseDate = array_key_exists('expected_close_date', $input)
            ? (trim((string) ($input['expected_close_date'] ?? '')) ?: null)
            : ($existing['expected_close_date'] ?? null);
        $contactId = array_key_exists('contact_id', $input)
            ? (($input['contact_id'] === '' || $input['contact_id'] === null) ? null : (int) $input['contact_id'])
            : ($existing['contact_id'] !== null ? (int) $existing['contact_id'] : null);
        $companyId = array_key_exists('company_id', $input)
            ? (($input['company_id'] === '' || $input['company_id'] === null) ? null : (int) $input['company_id'])
            : ($existing['company_id'] !== null ? (int) $existing['company_id'] : null);
        $notes = array_key_exists('notes', $input)
            ? (trim((string) ($input['notes'] ?? '')) ?: null)
            : ($existing['notes'] ?? null);

        $stmt = db()->prepare(
            'UPDATE deals
             SET title = ?, value = ?, stage = ?, probability = ?, expected_close_date = ?, contact_id = ?, company_id = ?, notes = ?, updated_at = NOW()
             WHERE id = ?'
        );
        $stmt->execute([
            $title,
            $value,
            $stage,
            $probability,
            $expectedCloseDate,
            $contactId,
            $companyId,
            $notes,
            $id,
        ]);
        json_response(['success' => true]);
    }

    if (preg_match('#^deals/(\d+)$#', $route, $matches) === 1 && $method === 'DELETE') {
        $id = (int) $matches[1];
        $stmt = db()->prepare('DELETE FROM deals WHERE id = ?');
        $stmt->execute([$id]);
        if ($stmt->rowCount() === 0) {
            json_response(['error' => 'Deal not found'], 404);
        }
        json_response(['success' => true]);
    }

    if ($route === 'projects' && $method === 'GET') {
        $rows = db()->query('SELECT * FROM projects ORDER BY id DESC')->fetchAll();
        json_response($rows);
    }

    if ($route === 'projects' && $method === 'POST') {
        $input = read_json_body();
        $name = trim((string) ($input['name'] ?? ''));
        if ($name === '') {
            json_response(['error' => 'Project name is required'], 400);
        }

        $description = trim((string) ($input['description'] ?? ''));
        $status = strtolower(trim((string) ($input['status'] ?? 'active'))) ?: 'active';

        $stmt = db()->prepare('INSERT INTO projects (name, description, status) VALUES (?, ?, ?)');
        $stmt->execute([
            $name,
            $description !== '' ? $description : null,
            $status,
        ]);

        $id = (int) db()->lastInsertId();
        $select = db()->prepare('SELECT * FROM projects WHERE id = ? LIMIT 1');
        $select->execute([$id]);
        $row = $select->fetch();
        json_response(['id' => $id, 'row' => $row, 'data' => $row]);
    }

    if (preg_match('#^projects/(\d+)$#', $route, $matches) === 1 && $method === 'PUT') {
        $id = (int) $matches[1];
        $input = read_json_body();

        $fields = [];
        $params = [];
        if (array_key_exists('name', $input)) {
            $name = trim((string) ($input['name'] ?? ''));
            if ($name === '') {
                json_response(['error' => 'Project name cannot be empty'], 400);
            }
            $fields[] = 'name = ?';
            $params[] = $name;
        }
        if (array_key_exists('description', $input)) {
            $fields[] = 'description = ?';
            $description = trim((string) ($input['description'] ?? ''));
            $params[] = $description !== '' ? $description : null;
        }
        if (array_key_exists('status', $input)) {
            $fields[] = 'status = ?';
            $status = strtolower(trim((string) ($input['status'] ?? 'active')));
            $params[] = $status !== '' ? $status : 'active';
        }
        if (count($fields) === 0) {
            json_response(['error' => 'No updatable fields provided'], 400);
        }

        $params[] = $id;
        $stmt = db()->prepare('UPDATE projects SET ' . implode(', ', $fields) . ' WHERE id = ?');
        $stmt->execute($params);

        if ($stmt->rowCount() === 0) {
            json_response(['error' => 'Project not found'], 404);
        }

        $select = db()->prepare('SELECT * FROM projects WHERE id = ? LIMIT 1');
        $select->execute([$id]);
        $row = $select->fetch();
        json_response(['success' => true, 'row' => $row, 'data' => $row]);
    }

    if (preg_match('#^projects/(\d+)$#', $route, $matches) === 1 && $method === 'DELETE') {
        $id = (int) $matches[1];
        $stmt = db()->prepare('DELETE FROM projects WHERE id = ?');
        $stmt->execute([$id]);
        if ($stmt->rowCount() === 0) {
            json_response(['error' => 'Project not found'], 404);
        }
        json_response(['success' => true]);
    }

    if ($route === 'employees' && $method === 'GET') {
        ensure_employee_records_for_all_users();
        collapse_duplicate_employee_rows();
        $rows = db()->query('SELECT * FROM employees ORDER BY id DESC')->fetchAll();
        json_response($rows);
    }

    if ($route === 'employees' && $method === 'POST') {
        $input = read_json_body();
        $name = trim((string) ($input['name'] ?? ''));
        if ($name === '') {
            json_response(['error' => 'Employee name is required'], 400);
        }
        $email = (string) ($input['email'] ?? '');
        $role = (string) ($input['role'] ?? '');
        $contactInfo = (string) ($input['contact_info'] ?? '');

        $stmt = db()->prepare('INSERT INTO employees (name, email, role, contact_info) VALUES (?, ?, ?, ?)');
        $stmt->execute([$name, $email, $role, $contactInfo]);
        json_response(['id' => (int) db()->lastInsertId()]);
    }

    if (preg_match('#^employees/(\d+)$#', $route, $matches) === 1 && $method === 'PUT') {
        $id = (int) $matches[1];
        $input = read_json_body();

        $nameInput = array_key_exists('full_name', $input) ? $input['full_name'] : ($input['name'] ?? null);
        $contactInput = array_key_exists('phone', $input) ? $input['phone'] : ($input['contact_info'] ?? null);

        $fields = [];
        $params = [];
        if ($nameInput !== null) {
            $fields[] = 'name = ?';
            $params[] = trim((string) $nameInput);
        }
        if (array_key_exists('email', $input)) {
            $fields[] = 'email = ?';
            $params[] = trim((string) ($input['email'] ?? ''));
        }
        if (array_key_exists('role', $input)) {
            $fields[] = 'role = ?';
            $params[] = trim((string) ($input['role'] ?? ''));
        }
        if ($contactInput !== null) {
            $fields[] = 'contact_info = ?';
            $params[] = trim((string) $contactInput);
        }
        if (array_key_exists('hourly_rate', $input)) {
            $fields[] = 'hourly_rate = ?';
            $params[] = $input['hourly_rate'] === '' || $input['hourly_rate'] === null ? null : (float) $input['hourly_rate'];
        }
        if (array_key_exists('hire_date', $input)) {
            $fields[] = 'hire_date = ?';
            $hireDate = trim((string) ($input['hire_date'] ?? ''));
            $params[] = $hireDate !== '' ? $hireDate : null;
        }
        if (array_key_exists('status', $input)) {
            $fields[] = 'status = ?';
            $params[] = trim((string) ($input['status'] ?? 'active')) ?: 'active';
        }
        if (count($fields) === 0) {
            json_response(['error' => 'No updatable fields provided'], 400);
        }

        $params[] = $id;
        $sql = 'UPDATE employees SET ' . implode(', ', $fields) . ' WHERE id = ?';
        $stmt = db()->prepare($sql);
        $stmt->execute($params);
        if ($stmt->rowCount() === 0) {
            json_response(['error' => 'Employee not found'], 404);
        }
        json_response(['success' => true]);
    }

    if ($route === 'calls' && $method === 'GET') {
        if ($canViewAllCalls) {
            $rows = db()->query('SELECT * FROM calls ORDER BY timestamp DESC')->fetchAll();
            json_response($rows);
        }

        $stmt = db()->prepare('SELECT * FROM calls WHERE created_by_user_id = ? ORDER BY timestamp DESC');
        $stmt->execute([$authUserId]);
        $rows = $stmt->fetchAll();
        json_response($rows);
    }

    if ($route === 'calls/metrics' && $method === 'GET') {
        if ($canViewAllCalls) {
            $row = db()->query('SELECT COUNT(*) AS totalCalls, AVG(duration) AS avgDuration FROM calls')->fetch();
        } else {
            $stmt = db()->prepare('SELECT COUNT(*) AS totalCalls, AVG(duration) AS avgDuration FROM calls WHERE created_by_user_id = ?');
            $stmt->execute([$authUserId]);
            $row = $stmt->fetch();
        }

        json_response([
            'totalCalls' => (int) ($row['totalCalls'] ?? 0),
            'avgDuration' => (float) ($row['avgDuration'] ?? 0),
        ]);
    }

    if ($route === 'calls' && $method === 'POST') {
        $input = read_json_body();
        $contactName = (string) ($input['contact_name'] ?? '');
        $phoneNumber = (string) ($input['phone_number'] ?? '');
        $duration = (int) ($input['duration'] ?? 0);
        $status = (string) ($input['status'] ?? 'completed');

        $stmt = db()->prepare('INSERT INTO calls (contact_name, phone_number, duration, status, created_by_user_id) VALUES (?, ?, ?, ?, ?)');
        $stmt->execute([$contactName, $phoneNumber, $duration, $status, $authUserId > 0 ? $authUserId : null]);
        json_response(['id' => (int) db()->lastInsertId()]);
    }

    if ($route === 'calendar-notes' && $method === 'GET') {
        collapse_duplicate_employee_rows();
        $where = [];
        $params = [];
        $date = trim((string) ($_GET['date'] ?? ''));
        if ($date !== '') {
            $where[] = 'cn.note_date = ?';
            $params[] = $date;
        }
        $contactId = trim((string) ($_GET['contact_id'] ?? ''));
        if ($contactId !== '') {
            $where[] = 'cn.contact_id = ?';
            $params[] = (int) $contactId;
        }

        $sql = 'SELECT
                    cn.*,
                    COALESCE(NULLIF(TRIM(e.name), \'\'), NULLIF(TRIM(u.name), \'\'), NULLIF(TRIM(u.email), \'\'), \'Team Member\') AS author_name,
                    u.email AS author_email,
                    u.role AS author_role
                FROM calendar_notes cn
                LEFT JOIN users u ON u.id = cn.created_by_user_id
                LEFT JOIN employees e ON LOWER(e.email) = LOWER(u.email)';
        if (count($where) > 0) {
            $sql .= ' WHERE ' . implode(' AND ', $where);
        }
        $sql .= ' ORDER BY cn.note_date DESC, cn.created_at DESC';
        $stmt = db()->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();
        json_response($rows);
    }

    if ($route === 'calendar-notes' && $method === 'POST') {
        $input = read_json_body();
        $noteDate = trim((string) ($input['note_date'] ?? ''));
        $noteText = trim((string) ($input['note_text'] ?? ''));
        if ($noteDate === '' || $noteText === '') {
            json_response(['error' => 'note_date and note_text are required'], 400);
        }

        $stmt = db()->prepare(
            'INSERT INTO calendar_notes (note_date, note_text, contact_id, contact_name, follow_up_type, priority, completed, created_by_user_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())'
        );
        $stmt->execute([
            $noteDate,
            $noteText,
            isset($input['contact_id']) && $input['contact_id'] !== '' ? (int) $input['contact_id'] : null,
            trim((string) ($input['contact_name'] ?? '')) ?: null,
            trim((string) ($input['follow_up_type'] ?? 'reminder')) ?: 'reminder',
            trim((string) ($input['priority'] ?? 'medium')) ?: 'medium',
            !empty($input['completed']) ? 1 : 0,
            $authUserId > 0 ? $authUserId : null,
        ]);
        json_response(['id' => (int) db()->lastInsertId()]);
    }

    if (preg_match('#^calendar-notes/(\d+)$#', $route, $matches) === 1 && $method === 'PUT') {
        $id = (int) $matches[1];
        $input = read_json_body();
        $stmt = db()->prepare(
            'UPDATE calendar_notes
             SET note_date = COALESCE(?, note_date),
                 note_text = COALESCE(?, note_text),
                 contact_id = ?,
                 contact_name = ?,
                 follow_up_type = COALESCE(?, follow_up_type),
                 priority = COALESCE(?, priority),
                 completed = COALESCE(?, completed),
                 updated_at = NOW()
             WHERE id = ?'
        );
        $completed = array_key_exists('completed', $input) ? (!empty($input['completed']) ? 1 : 0) : null;
        $stmt->execute([
            trim((string) ($input['note_date'] ?? '')) ?: null,
            trim((string) ($input['note_text'] ?? '')) ?: null,
            array_key_exists('contact_id', $input) ? (($input['contact_id'] === '' || $input['contact_id'] === null) ? null : (int) $input['contact_id']) : null,
            array_key_exists('contact_name', $input) ? (trim((string) ($input['contact_name'] ?? '')) ?: null) : null,
            trim((string) ($input['follow_up_type'] ?? '')) ?: null,
            trim((string) ($input['priority'] ?? '')) ?: null,
            $completed,
            $id,
        ]);
        if ($stmt->rowCount() === 0) {
            json_response(['error' => 'Calendar note not found'], 404);
        }
        json_response(['success' => true]);
    }

    if (preg_match('#^calendar-notes/(\d+)$#', $route, $matches) === 1 && $method === 'DELETE') {
        $id = (int) $matches[1];
        $stmt = db()->prepare('DELETE FROM calendar_notes WHERE id = ?');
        $stmt->execute([$id]);
        if ($stmt->rowCount() === 0) {
            json_response(['error' => 'Calendar note not found'], 404);
        }
        json_response(['success' => true]);
    }

    if ($route === 'meetings' && $method === 'GET') {
        $rows = db()->query('SELECT * FROM meetings ORDER BY scheduled_date ASC, scheduled_time ASC')->fetchAll();
        json_response($rows);
    }

    if ($route === 'meetings' && $method === 'POST') {
        $input = read_json_body();
        $title = trim((string) ($input['title'] ?? ''));
        $scheduledDate = trim((string) ($input['scheduled_date'] ?? ''));
        $scheduledTime = trim((string) ($input['scheduled_time'] ?? ''));
        if ($title === '' || $scheduledDate === '' || $scheduledTime === '') {
            json_response(['error' => 'title, scheduled_date, and scheduled_time are required'], 400);
        }

        $attendees = $input['attendees'] ?? [];
        if (!is_array($attendees)) {
            $attendees = [];
        }

        $stmt = db()->prepare(
            'INSERT INTO meetings (title, meeting_type, scheduled_date, scheduled_time, duration, description, room_name, status, attendees_json, created_by_user_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())'
        );
        $stmt->execute([
            $title,
            trim((string) ($input['meeting_type'] ?? 'video')) ?: 'video',
            $scheduledDate,
            $scheduledTime,
            trim((string) ($input['duration'] ?? '30 minutes')) ?: '30 minutes',
            trim((string) ($input['description'] ?? '')) ?: null,
            trim((string) ($input['room_name'] ?? 'SthillStudiosMain')) ?: 'SthillStudiosMain',
            trim((string) ($input['status'] ?? 'scheduled')) ?: 'scheduled',
            json_encode(array_values($attendees), JSON_UNESCAPED_SLASHES),
            $authUserId > 0 ? $authUserId : null,
        ]);
        json_response(['id' => (int) db()->lastInsertId()]);
    }

    if (preg_match('#^meetings/(\d+)$#', $route, $matches) === 1 && $method === 'DELETE') {
        $id = (int) $matches[1];
        $stmt = db()->prepare('DELETE FROM meetings WHERE id = ?');
        $stmt->execute([$id]);
        if ($stmt->rowCount() === 0) {
            json_response(['error' => 'Meeting not found'], 404);
        }
        json_response(['success' => true]);
    }

    if ($route === 'shift-entries' && $method === 'GET') {
        $requestedUserId = isset($_GET['user_id']) ? (int) $_GET['user_id'] : $authUserId;
        $targetUserId = $requestedUserId > 0 ? $requestedUserId : $authUserId;

        if (!$canViewAllCalls && $targetUserId !== $authUserId) {
            json_response(['error' => 'Forbidden'], 403);
        }

        $stmt = db()->prepare('SELECT * FROM shift_entries WHERE user_id = ? ORDER BY clock_in DESC LIMIT 200');
        $stmt->execute([$targetUserId]);
        $rows = $stmt->fetchAll();
        json_response($rows);
    }

    if ($route === 'shift-entries' && $method === 'POST') {
        $input = read_json_body();
        $userId = isset($input['user_id']) ? (int) $input['user_id'] : $authUserId;
        if ($userId <= 0) {
            json_response(['error' => 'Invalid user'], 400);
        }
        if (!$canViewAllCalls && $userId !== $authUserId) {
            json_response(['error' => 'Forbidden'], 403);
        }

        $shiftDate = trim((string) ($input['shift_date'] ?? gmdate('Y-m-d')));
        $clockIn = trim((string) ($input['clock_in'] ?? gmdate('Y-m-d H:i:s')));
        $status = trim((string) ($input['status'] ?? 'clocked_in')) ?: 'clocked_in';

        $stmt = db()->prepare(
            'INSERT INTO shift_entries (user_id, shift_date, clock_in, clock_out, lunch_start, lunch_end, lunch_duration_minutes, total_hours, status, notes, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())'
        );
        $stmt->execute([
            $userId,
            $shiftDate,
            $clockIn,
            trim((string) ($input['clock_out'] ?? '')) ?: null,
            trim((string) ($input['lunch_start'] ?? '')) ?: null,
            trim((string) ($input['lunch_end'] ?? '')) ?: null,
            (int) ($input['lunch_duration_minutes'] ?? 0),
            isset($input['total_hours']) ? (float) $input['total_hours'] : null,
            $status,
            trim((string) ($input['notes'] ?? '')) ?: null,
        ]);
        $id = (int) db()->lastInsertId();
        $select = db()->prepare('SELECT * FROM shift_entries WHERE id = ? LIMIT 1');
        $select->execute([$id]);
        $row = $select->fetch();
        json_response(['id' => $id, 'row' => $row, 'data' => $row]);
    }

    if (preg_match('#^shift-entries/(\d+)$#', $route, $matches) === 1 && $method === 'PUT') {
        $id = (int) $matches[1];
        $input = read_json_body();
        $check = db()->prepare('SELECT user_id, clock_in, lunch_start, lunch_duration_minutes FROM shift_entries WHERE id = ? LIMIT 1');
        $check->execute([$id]);
        $existing = $check->fetch();
        if (!$existing) {
            json_response(['error' => 'Shift entry not found'], 404);
        }
        $ownerUserId = (int) ($existing['user_id'] ?? 0);
        if (!$canViewAllCalls && $ownerUserId !== $authUserId) {
            json_response(['error' => 'Forbidden'], 403);
        }

        $stmt = db()->prepare(
            'UPDATE shift_entries
             SET clock_in = COALESCE(?, clock_in),
                 clock_out = COALESCE(?, clock_out),
                 lunch_start = COALESCE(?, lunch_start),
                 lunch_end = COALESCE(?, lunch_end),
                 lunch_duration_minutes = COALESCE(?, lunch_duration_minutes),
                 total_hours = COALESCE(?, total_hours),
                 status = COALESCE(?, status),
                 notes = COALESCE(?, notes),
                 updated_at = NOW()
             WHERE id = ?'
        );
        $stmt->execute([
            trim((string) ($input['clock_in'] ?? '')) ?: null,
            trim((string) ($input['clock_out'] ?? '')) ?: null,
            trim((string) ($input['lunch_start'] ?? '')) ?: null,
            trim((string) ($input['lunch_end'] ?? '')) ?: null,
            array_key_exists('lunch_duration_minutes', $input) ? (int) $input['lunch_duration_minutes'] : null,
            array_key_exists('total_hours', $input) ? (float) $input['total_hours'] : null,
            trim((string) ($input['status'] ?? '')) ?: null,
            array_key_exists('notes', $input) ? (trim((string) $input['notes']) ?: null) : null,
            $id,
        ]);

        $select = db()->prepare('SELECT * FROM shift_entries WHERE id = ? LIMIT 1');
        $select->execute([$id]);
        $row = $select->fetch();
        json_response(['success' => true, 'row' => $row, 'data' => $row]);
    }

    if (preg_match('#^shift-entries/(\d+)$#', $route, $matches) === 1 && $method === 'DELETE') {
        $id = (int) $matches[1];
        $check = db()->prepare('SELECT user_id FROM shift_entries WHERE id = ? LIMIT 1');
        $check->execute([$id]);
        $existing = $check->fetch();
        if (!$existing) {
            json_response(['error' => 'Shift entry not found'], 404);
        }
        $ownerUserId = (int) ($existing['user_id'] ?? 0);
        if (!$canViewAllCalls && $ownerUserId !== $authUserId) {
            json_response(['error' => 'Forbidden'], 403);
        }

        $stmt = db()->prepare('DELETE FROM shift_entries WHERE id = ?');
        $stmt->execute([$id]);
        json_response(['success' => true]);
    }

    if ($route === 'break-entries' && $method === 'GET') {
        $requestedUserId = isset($_GET['user_id']) ? (int) $_GET['user_id'] : $authUserId;
        $targetUserId = $requestedUserId > 0 ? $requestedUserId : $authUserId;
        if (!$canViewAllCalls && $targetUserId !== $authUserId) {
            json_response(['error' => 'Forbidden'], 403);
        }

        $where = ['user_id = ?'];
        $params = [$targetUserId];
        if (isset($_GET['shift_id']) && $_GET['shift_id'] !== '') {
            $where[] = 'shift_id = ?';
            $params[] = (int) $_GET['shift_id'];
        }
        if (isset($_GET['status']) && trim((string) $_GET['status']) !== '') {
            $where[] = 'status = ?';
            $params[] = trim((string) $_GET['status']);
        }

        $sql = 'SELECT * FROM break_entries WHERE ' . implode(' AND ', $where) . ' ORDER BY break_start DESC LIMIT 200';
        $stmt = db()->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();
        json_response($rows);
    }

    if ($route === 'break-entries' && $method === 'POST') {
        $input = read_json_body();
        $userId = isset($input['user_id']) ? (int) $input['user_id'] : $authUserId;
        if ($userId <= 0) {
            json_response(['error' => 'Invalid user'], 400);
        }
        if (!$canViewAllCalls && $userId !== $authUserId) {
            json_response(['error' => 'Forbidden'], 403);
        }

        $breakStart = trim((string) ($input['break_start'] ?? gmdate('Y-m-d H:i:s')));
        if ($breakStart === '') {
            $breakStart = gmdate('Y-m-d H:i:s');
        }

        $stmt = db()->prepare(
            'INSERT INTO break_entries (user_id, shift_id, break_start, break_end, duration_minutes, break_type, status, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $userId,
            isset($input['shift_id']) && $input['shift_id'] !== '' ? (int) $input['shift_id'] : null,
            $breakStart,
            trim((string) ($input['break_end'] ?? '')) ?: null,
            isset($input['duration_minutes']) ? (int) $input['duration_minutes'] : 0,
            trim((string) ($input['break_type'] ?? '15-minute')) ?: '15-minute',
            trim((string) ($input['status'] ?? 'in_progress')) ?: 'in_progress',
            trim((string) ($input['notes'] ?? '')) ?: null,
        ]);

        $id = (int) db()->lastInsertId();
        $select = db()->prepare('SELECT * FROM break_entries WHERE id = ? LIMIT 1');
        $select->execute([$id]);
        $row = $select->fetch();
        json_response(['id' => $id, 'row' => $row, 'data' => $row]);
    }

    if (preg_match('#^break-entries/(\d+)$#', $route, $matches) === 1 && $method === 'PUT') {
        $id = (int) $matches[1];
        $input = read_json_body();

        $check = db()->prepare('SELECT user_id FROM break_entries WHERE id = ? LIMIT 1');
        $check->execute([$id]);
        $existing = $check->fetch();
        if (!$existing) {
            json_response(['error' => 'Break entry not found'], 404);
        }
        $ownerUserId = (int) ($existing['user_id'] ?? 0);
        if (!$canViewAllCalls && $ownerUserId !== $authUserId) {
            json_response(['error' => 'Forbidden'], 403);
        }

        $stmt = db()->prepare(
            'UPDATE break_entries
             SET break_start = COALESCE(?, break_start),
                 break_end = COALESCE(?, break_end),
                 duration_minutes = COALESCE(?, duration_minutes),
                 break_type = COALESCE(?, break_type),
                 status = COALESCE(?, status),
                 notes = COALESCE(?, notes),
                 updated_at = NOW()
             WHERE id = ?'
        );
        $stmt->execute([
            trim((string) ($input['break_start'] ?? '')) ?: null,
            trim((string) ($input['break_end'] ?? '')) ?: null,
            array_key_exists('duration_minutes', $input) ? (int) $input['duration_minutes'] : null,
            trim((string) ($input['break_type'] ?? '')) ?: null,
            trim((string) ($input['status'] ?? '')) ?: null,
            array_key_exists('notes', $input) ? (trim((string) $input['notes']) ?: null) : null,
            $id,
        ]);

        $select = db()->prepare('SELECT * FROM break_entries WHERE id = ? LIMIT 1');
        $select->execute([$id]);
        $row = $select->fetch();
        json_response(['success' => true, 'row' => $row, 'data' => $row]);
    }

    if (preg_match('#^break-entries/(\d+)$#', $route, $matches) === 1 && $method === 'DELETE') {
        $id = (int) $matches[1];
        $check = db()->prepare('SELECT user_id FROM break_entries WHERE id = ? LIMIT 1');
        $check->execute([$id]);
        $existing = $check->fetch();
        if (!$existing) {
            json_response(['error' => 'Break entry not found'], 404);
        }
        $ownerUserId = (int) ($existing['user_id'] ?? 0);
        if (!$canViewAllCalls && $ownerUserId !== $authUserId) {
            json_response(['error' => 'Forbidden'], 403);
        }

        $stmt = db()->prepare('DELETE FROM break_entries WHERE id = ?');
        $stmt->execute([$id]);
        json_response(['success' => true]);
    }

    if ($route === 'leads' && $method === 'GET') {
        $rows = db()->query('SELECT * FROM leads ORDER BY timestamp DESC')->fetchAll();
        json_response($rows);
    }

    if ($route === 'leads' && $method === 'POST') {
        $input = read_json_body();
        $name = trim((string) ($input['name'] ?? ''));
        if ($name === '') {
            json_response(['error' => 'Lead name is required'], 400);
        }
        $stmt = db()->prepare('INSERT INTO leads (name, email, phone, source, created_by_user_id) VALUES (?, ?, ?, ?, ?)');
        $stmt->execute([
            $name,
            trim((string) ($input['email'] ?? '')),
            trim((string) ($input['phone'] ?? '')),
            trim((string) ($input['source'] ?? 'manual')) ?: 'manual',
            $authUserId > 0 ? $authUserId : null,
        ]);
        json_response(['id' => (int) db()->lastInsertId()]);
    }

    if (preg_match('#^leads/(\d+)$#', $route, $matches) === 1 && $method === 'PUT') {
        $id = (int) $matches[1];
        $input = read_json_body();

        $fields = [];
        $params = [];
        if (array_key_exists('name', $input)) {
            $fields[] = 'name = ?';
            $params[] = trim((string) ($input['name'] ?? ''));
        }
        if (array_key_exists('email', $input)) {
            $fields[] = 'email = ?';
            $params[] = trim((string) ($input['email'] ?? ''));
        }
        if (array_key_exists('phone', $input)) {
            $fields[] = 'phone = ?';
            $params[] = trim((string) ($input['phone'] ?? ''));
        }
        if (array_key_exists('source', $input)) {
            $fields[] = 'source = ?';
            $params[] = trim((string) ($input['source'] ?? 'manual')) ?: 'manual';
        }
        if (array_key_exists('created_by_user_id', $input)) {
            $fields[] = 'created_by_user_id = ?';
            $createdBy = $input['created_by_user_id'];
            $params[] = $createdBy === '' || $createdBy === null ? null : (int) $createdBy;
        }
        if (count($fields) === 0) {
            json_response(['error' => 'No updatable fields provided'], 400);
        }

        $params[] = $id;
        $sql = 'UPDATE leads SET ' . implode(', ', $fields) . ' WHERE id = ?';
        $stmt = db()->prepare($sql);
        $stmt->execute($params);
        if ($stmt->rowCount() === 0) {
            json_response(['error' => 'Lead not found'], 404);
        }
        json_response(['success' => true]);
    }

    if (preg_match('#^leads/(\d+)$#', $route, $matches) === 1 && $method === 'DELETE') {
        $id = (int) $matches[1];
        $stmt = db()->prepare('DELETE FROM leads WHERE id = ?');
        $stmt->execute([$id]);
        if ($stmt->rowCount() === 0) {
            json_response(['error' => 'Lead not found'], 404);
        }
        json_response(['success' => true]);
    }

    if ($route === 'leads/upload' && $method === 'POST') {
        if (!str_contains($authRole, 'admin')) {
            json_response(['error' => 'Only administrators can import leads'], 403);
        }

        if (!isset($_FILES['file']) || !is_array($_FILES['file'])) {
            json_response(['error' => 'No file uploaded'], 400);
        }

        $file = $_FILES['file'];
        $tmpPath = (string) ($file['tmp_name'] ?? '');
        $originalName = (string) ($file['name'] ?? 'upload.csv');
        if ($tmpPath === '' || !is_uploaded_file($tmpPath)) {
            json_response(['error' => 'Invalid uploaded file'], 400);
        }

        $extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
        if ($extension !== 'csv' && $extension !== 'txt') {
            json_response(['error' => 'Unsupported file type on PHP deployment. Please upload CSV.'], 400);
        }

        $handle = fopen($tmpPath, 'rb');
        if ($handle === false) {
            json_response(['error' => 'Unable to read uploaded file'], 400);
        }

        $rows = [];
        while (($cols = fgetcsv($handle)) !== false) {
            if (!is_array($cols) || count($cols) === 0) {
                continue;
            }

            $name = trim((string) ($cols[0] ?? ''));
            $email = trim((string) ($cols[1] ?? ''));
            $phone = trim((string) ($cols[2] ?? ''));

            if ($name === '' && $email === '' && $phone === '') {
                continue;
            }
            // Skip header row if present.
            if (strtolower($name) === 'name' && strtolower($email) === 'email') {
                continue;
            }

            $rows[] = [
                $name !== '' ? $name : 'Unknown',
                $email,
                $phone,
                $originalName,
            ];
        }
        fclose($handle);

        if (count($rows) > 0) {
            $stmt = db()->prepare('INSERT INTO leads (name, email, phone, source) VALUES (?, ?, ?, ?)');
            foreach ($rows as $lead) {
                $stmt->execute($lead);
            }
        }

        json_response(['success' => true, 'count' => count($rows)]);
    }

    json_response(['error' => 'Not found'], 404);
} catch (Throwable $e) {
    json_response(['error' => 'Internal server error', 'details' => $e->getMessage()], 500);
}
