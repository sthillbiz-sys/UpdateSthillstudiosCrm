<?php
declare(strict_types=1);

function app_root_path(): string {
    return dirname(__DIR__);
}

function parse_env_file(string $filePath): array {
    if (!is_file($filePath)) {
        return [];
    }

    $vars = [];
    $lines = file($filePath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($lines === false) {
        return [];
    }

    foreach ($lines as $line) {
        $trimmed = trim($line);
        if ($trimmed === '' || str_starts_with($trimmed, '#')) {
            continue;
        }

        $pos = strpos($trimmed, '=');
        if ($pos === false) {
            continue;
        }

        $key = trim(substr($trimmed, 0, $pos));
        $value = trim(substr($trimmed, $pos + 1));
        if ($key === '') {
            continue;
        }

        if (
            strlen($value) >= 2 &&
            (($value[0] === '"' && $value[strlen($value) - 1] === '"') ||
            ($value[0] === "'" && $value[strlen($value) - 1] === "'"))
        ) {
            $value = substr($value, 1, -1);
        }

        $vars[$key] = $value;
    }

    return $vars;
}

function env(string $key, ?string $default = null): ?string {
    static $loaded = null;

    if ($loaded === null) {
        $loaded = [];
        $loaded = array_merge($loaded, parse_env_file(app_root_path() . '/.env'));
        $loaded = array_merge($loaded, parse_env_file(app_root_path() . '/.env.local'));
    }

    $serverValue = $_SERVER[$key] ?? getenv($key);
    if ($serverValue !== false && $serverValue !== null && $serverValue !== '') {
        return (string) $serverValue;
    }

    if (array_key_exists($key, $loaded)) {
        return $loaded[$key];
    }

    return $default;
}

function env_bool(string $key, bool $default = false): bool {
    $value = strtolower((string) env($key, $default ? 'true' : 'false'));
    return in_array($value, ['1', 'true', 'yes', 'on'], true);
}

function set_cors_headers(): void {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
}

function json_response(array $payload, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES);
    exit;
}

function read_json_body(): array {
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function db(): PDO {
    static $pdo = null;

    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $host = trim((string) env('MYSQL_HOST', 'localhost'));
    $port = (string) env('MYSQL_PORT', '3306');
    $socketPath = trim((string) env('MYSQL_SOCKET_PATH', ''));
    $user = (string) env('MYSQL_USER', '');
    $pass = (string) env('MYSQL_PASSWORD', '');
    $name = (string) env('MYSQL_DATABASE', '');
    $charset = 'utf8mb4';

    if ($socketPath === '' && $host === '') {
        $host = 'localhost';
    }
    if ($socketPath === '' && ($host === 'localhost' || $host === '127.0.0.1')) {
        $socketCandidates = [
            '/var/run/mysqld/mysqld.sock',
            '/var/lib/mysql/mysql.sock',
            '/tmp/mysql.sock',
        ];
        foreach ($socketCandidates as $candidate) {
            if (is_file($candidate)) {
                $socketPath = $candidate;
                break;
            }
        }
    }
    if ($user === '' || $name === '') {
        throw new RuntimeException('Missing MySQL configuration (MYSQL_USER / MYSQL_DATABASE).');
    }

    if ($socketPath !== '') {
        $dsn = "mysql:unix_socket={$socketPath};dbname={$name};charset={$charset}";
    } else {
        $dsn = "mysql:host={$host};port={$port};dbname={$name};charset={$charset}";
    }
    $pdo = new PDO($dsn, $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);

    return $pdo;
}

function base64url_encode(string $data): string {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function base64url_decode(string $data): string {
    $remainder = strlen($data) % 4;
    if ($remainder > 0) {
        $data .= str_repeat('=', 4 - $remainder);
    }
    $decoded = base64_decode(strtr($data, '-_', '+/'), true);
    return $decoded === false ? '' : $decoded;
}

function jwt_secret(): string {
    $secret = (string) env('JWT_SECRET', '');
    if ($secret !== '') {
        return $secret;
    }
    return 'dev-only-change-me';
}

function sign_token(array $payload, int $ttlSeconds = 43200): string {
    $header = ['alg' => 'HS256', 'typ' => 'JWT'];
    $issuedAt = time();
    $payload['iat'] = $issuedAt;
    $payload['exp'] = $issuedAt + $ttlSeconds;

    $encodedHeader = base64url_encode(json_encode($header, JSON_UNESCAPED_SLASHES));
    $encodedPayload = base64url_encode(json_encode($payload, JSON_UNESCAPED_SLASHES));
    $signatureBase = $encodedHeader . '.' . $encodedPayload;
    $signature = hash_hmac('sha256', $signatureBase, jwt_secret(), true);
    return $signatureBase . '.' . base64url_encode($signature);
}

function verify_token(string $token): ?array {
    $parts = explode('.', $token);
    if (count($parts) !== 3) {
        return null;
    }

    [$header, $payload, $signature] = $parts;
    $signatureBase = $header . '.' . $payload;
    $expected = base64url_encode(hash_hmac('sha256', $signatureBase, jwt_secret(), true));
    if (!hash_equals($expected, $signature)) {
        return null;
    }

    $payloadJson = base64url_decode($payload);
    if ($payloadJson === '') {
        return null;
    }

    $claims = json_decode($payloadJson, true);
    if (!is_array($claims)) {
        return null;
    }

    $exp = isset($claims['exp']) ? (int) $claims['exp'] : 0;
    if ($exp > 0 && $exp < time()) {
        return null;
    }

    return $claims;
}

function get_auth_header(): ?string {
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if ($header !== '') {
        return $header;
    }

    if (function_exists('apache_request_headers')) {
        $headers = apache_request_headers();
        if (is_array($headers)) {
            foreach ($headers as $name => $value) {
                if (strtolower($name) === 'authorization') {
                    return (string) $value;
                }
            }
        }
    }

    return null;
}

function require_auth_user(): array {
    $header = get_auth_header();
    if ($header === null || !preg_match('/^Bearer\s+(.+)$/i', $header, $matches)) {
        json_response(['error' => 'Missing auth token'], 401);
    }

    $claims = verify_token($matches[1]);
    if (!$claims) {
        json_response(['error' => 'Invalid or expired token'], 401);
    }

    return $claims;
}

function safe_user_from_row(array $row): array {
    return [
        'id' => (int) $row['id'],
        'name' => (string) $row['name'],
        'email' => (string) $row['email'],
        'role' => (string) ($row['role'] ?? 'agent'),
    ];
}

function normalize_employee_role_from_user_role(?string $value): string {
    $role = strtolower(trim((string) $value));
    if ($role === '') {
        return 'employee';
    }
    if (str_contains($role, 'admin')) {
        return 'admin';
    }
    if (str_contains($role, 'agent')) {
        return 'agent';
    }
    if (str_contains($role, 'manager')) {
        return 'agent';
    }
    return 'employee';
}

function employee_role_priority(?string $value): int {
    $role = normalize_employee_role_from_user_role($value);
    if ($role === 'admin') {
        return 3;
    }
    if ($role === 'agent') {
        return 2;
    }
    return 1;
}

function collapse_duplicate_employee_rows_for_email(string $email): void {
    $normalizedEmail = strtolower(trim($email));
    if ($normalizedEmail === '') {
        return;
    }

    $pdo = db();
    $select = $pdo->prepare('SELECT * FROM employees WHERE LOWER(email) = LOWER(?) ORDER BY id ASC');
    $select->execute([$normalizedEmail]);
    $rows = $select->fetchAll();

    if (count($rows) <= 1) {
        return;
    }

    $keeper = $rows[0];
    $keeperId = (int) ($keeper['id'] ?? 0);
    if ($keeperId <= 0) {
        return;
    }

    $mergedName = trim((string) ($keeper['name'] ?? ''));
    $mergedRole = trim((string) ($keeper['role'] ?? ''));
    $mergedContactInfo = trim((string) ($keeper['contact_info'] ?? ''));
    $mergedStatus = trim((string) ($keeper['status'] ?? ''));
    $mergedHourlyRate = $keeper['hourly_rate'] ?? null;
    $mergedHireDate = trim((string) ($keeper['hire_date'] ?? ''));

    foreach ($rows as $row) {
        $name = trim((string) ($row['name'] ?? ''));
        if ($mergedName === '' && $name !== '') {
            $mergedName = $name;
        }

        $role = trim((string) ($row['role'] ?? ''));
        if ($role !== '' && employee_role_priority($role) > employee_role_priority($mergedRole)) {
            $mergedRole = $role;
        }

        $contactInfo = trim((string) ($row['contact_info'] ?? ''));
        if ($mergedContactInfo === '' && $contactInfo !== '') {
            $mergedContactInfo = $contactInfo;
        }

        $status = trim((string) ($row['status'] ?? ''));
        if ($mergedStatus === '' && $status !== '') {
            $mergedStatus = $status;
        } elseif (strtolower($mergedStatus) !== 'active' && strtolower($status) === 'active') {
            $mergedStatus = $status;
        }

        if (($mergedHourlyRate === null || $mergedHourlyRate === '') && array_key_exists('hourly_rate', $row)) {
            $candidateHourlyRate = $row['hourly_rate'] ?? null;
            if ($candidateHourlyRate !== null && $candidateHourlyRate !== '') {
                $mergedHourlyRate = $candidateHourlyRate;
            }
        }

        $hireDate = trim((string) ($row['hire_date'] ?? ''));
        if ($mergedHireDate === '' && $hireDate !== '') {
            $mergedHireDate = $hireDate;
        }
    }

    $fields = [];
    $params = [];

    if (array_key_exists('name', $keeper) && trim((string) ($keeper['name'] ?? '')) !== $mergedName) {
        $fields[] = 'name = ?';
        $params[] = $mergedName;
    }
    if (array_key_exists('role', $keeper) && trim((string) ($keeper['role'] ?? '')) !== $mergedRole) {
        $fields[] = 'role = ?';
        $params[] = $mergedRole;
    }
    if (array_key_exists('contact_info', $keeper) && trim((string) ($keeper['contact_info'] ?? '')) !== $mergedContactInfo) {
        $fields[] = 'contact_info = ?';
        $params[] = $mergedContactInfo;
    }
    if (array_key_exists('status', $keeper) && trim((string) ($keeper['status'] ?? '')) !== $mergedStatus) {
        $fields[] = 'status = ?';
        $params[] = $mergedStatus;
    }
    if (array_key_exists('hourly_rate', $keeper) && ($keeper['hourly_rate'] ?? null) != $mergedHourlyRate) {
        $fields[] = 'hourly_rate = ?';
        $params[] = $mergedHourlyRate;
    }
    if (array_key_exists('hire_date', $keeper) && trim((string) ($keeper['hire_date'] ?? '')) !== $mergedHireDate) {
        $fields[] = 'hire_date = ?';
        $params[] = $mergedHireDate !== '' ? $mergedHireDate : null;
    }

    if (count($fields) > 0) {
        $params[] = $keeperId;
        $update = $pdo->prepare('UPDATE employees SET ' . implode(', ', $fields) . ' WHERE id = ?');
        $update->execute($params);
    }

    $duplicateIds = [];
    foreach (array_slice($rows, 1) as $row) {
        $id = (int) ($row['id'] ?? 0);
        if ($id > 0) {
            $duplicateIds[] = $id;
        }
    }

    if (count($duplicateIds) === 0) {
        return;
    }

    $placeholders = implode(', ', array_fill(0, count($duplicateIds), '?'));
    $delete = $pdo->prepare('DELETE FROM employees WHERE id IN (' . $placeholders . ')');
    $delete->execute($duplicateIds);
}

function collapse_duplicate_employee_rows(): void {
    $rows = db()->query(
        'SELECT LOWER(email) AS email_key
         FROM employees
         WHERE email IS NOT NULL AND TRIM(email) <> ""
         GROUP BY LOWER(email)
         HAVING COUNT(*) > 1'
    )->fetchAll();

    foreach ($rows as $row) {
        $emailKey = strtolower(trim((string) ($row['email_key'] ?? '')));
        if ($emailKey === '') {
            continue;
        }
        collapse_duplicate_employee_rows_for_email($emailKey);
    }
}

function ensure_employee_record_for_user(array $userRow): void {
    $email = strtolower(trim((string) ($userRow['email'] ?? '')));
    if ($email === '') {
        return;
    }

    $name = trim((string) ($userRow['name'] ?? ''));
    if ($name === '') {
        $name = explode('@', $email)[0] ?? 'User';
    }
    $role = normalize_employee_role_from_user_role((string) ($userRow['role'] ?? ''));

    collapse_duplicate_employee_rows_for_email($email);

    $pdo = db();
    $select = $pdo->prepare('SELECT id, name, role FROM employees WHERE LOWER(email) = LOWER(?) ORDER BY id ASC LIMIT 1');
    $select->execute([$email]);
    $existing = $select->fetch();

    if (!$existing) {
        $insert = $pdo->prepare(
            'INSERT INTO employees (name, email, role, contact_info)
             VALUES (?, ?, ?, ?)'
        );
        $insert->execute([$name, $email, $role, '']);
        return;
    }

    $fields = [];
    $params = [];
    $existingName = trim((string) ($existing['name'] ?? ''));
    $existingRole = trim((string) ($existing['role'] ?? ''));
    if ($existingName === '') {
        $fields[] = 'name = ?';
        $params[] = $name;
    }
    if (strtolower($existingRole) !== strtolower($role)) {
        $fields[] = 'role = ?';
        $params[] = $role;
    }

    if (count($fields) === 0) {
        return;
    }

    $params[] = (int) $existing['id'];
    $sql = 'UPDATE employees SET ' . implode(', ', $fields) . ' WHERE id = ?';
    $update = $pdo->prepare($sql);
    $update->execute($params);
}

function ensure_employee_records_for_all_users(): void {
    $pdo = db();
    $rows = $pdo->query('SELECT id, name, email, role FROM users WHERE email IS NOT NULL AND email <> ""')->fetchAll();
    foreach ($rows as $row) {
        if (!is_array($row)) {
            continue;
        }
        ensure_employee_record_for_user($row);
    }
    collapse_duplicate_employee_rows();
}

function password_is_hash(string $value): bool {
    return str_starts_with($value, '$2y$') || str_starts_with($value, '$2a$') || str_starts_with($value, '$2b$');
}

function seed_initial_data(): void {
    static $seeded = false;
    if ($seeded) {
        return;
    }
    $seeded = true;

    $pdo = db();

    $contactCount = (int) $pdo->query('SELECT COUNT(*) AS count FROM contacts')->fetchColumn();
    if ($contactCount === 0) {
        $stmt = $pdo->prepare('INSERT INTO contacts (name, email, status) VALUES (?, ?, ?)');
        $stmt->execute(['Test Contact', 'test@example.com', 'active']);

        $projectStmt = $pdo->prepare('INSERT INTO projects (name, description, status) VALUES (?, ?, ?)');
        $projectStmt->execute(['Sthillstudios.com', 'SthillStudios.com project', 'active']);
        $projectStmt->execute(['Bamead.com', 'Bamead.com project', 'active']);

        $employeeStmt = $pdo->prepare('INSERT INTO employees (name, email, role, contact_info) VALUES (?, ?, ?, ?)');
        $employeeStmt->execute(['Adrian St.Hill', 'adrian@sthillstudios.com', 'CEO/Admin', '+1234567890']);
    }

    $userCount = (int) $pdo->query('SELECT COUNT(*) AS count FROM users')->fetchColumn();
    if ($userCount > 0) {
        return;
    }

    $adminName = trim((string) env('CRM_ADMIN_NAME', ''));
    $adminEmail = strtolower(trim((string) env('CRM_ADMIN_EMAIL', '')));
    $adminPassword = (string) env('CRM_ADMIN_PASSWORD', '');
    if ($adminName === '' || $adminEmail === '' || $adminPassword === '') {
        return;
    }

    $hashed = password_hash($adminPassword, PASSWORD_BCRYPT);
    $stmt = $pdo->prepare('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)');
    $stmt->execute([$adminName, $adminEmail, $hashed, 'admin']);
}

function ensure_runtime_schema(): void {
    static $ensured = false;
    if ($ensured) {
        return;
    }
    $ensured = true;

    $pdo = db();
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS user_presence (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            email VARCHAR(191) NOT NULL,
            name VARCHAR(191) NOT NULL,
            role VARCHAR(64) NOT NULL DEFAULT "agent",
            status VARCHAR(32) NOT NULL DEFAULT "available",
            custom_message TEXT NULL,
            is_on_call TINYINT(1) NOT NULL DEFAULT 0,
            last_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_offline_at DATETIME NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY user_presence_user_id_unique (user_id),
            INDEX user_presence_email_idx (email),
            INDEX user_presence_status_idx (status),
            INDEX user_presence_last_seen_idx (last_seen)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS activities (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            related_to_type VARCHAR(64) NOT NULL DEFAULT "contact",
            related_to_id VARCHAR(64) NULL,
            type VARCHAR(32) NOT NULL DEFAULT "task",
            title VARCHAR(255) NOT NULL,
            description TEXT NULL,
            due_date DATETIME NULL,
            completed TINYINT(1) NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX activities_user_id_idx (user_id),
            INDEX activities_due_date_idx (due_date),
            INDEX activities_completed_idx (completed),
            INDEX activities_user_completed_idx (user_id, completed)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS break_entries (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            shift_id INT NULL,
            break_start DATETIME NOT NULL,
            break_end DATETIME NULL,
            duration_minutes INT NOT NULL DEFAULT 0,
            break_type VARCHAR(64) NOT NULL DEFAULT "15-minute",
            status VARCHAR(32) NOT NULL DEFAULT "in_progress",
            notes TEXT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX break_entries_user_id_idx (user_id),
            INDEX break_entries_shift_id_idx (shift_id),
            INDEX break_entries_status_idx (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS conversations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(191) NOT NULL,
            is_group TINYINT(1) NOT NULL DEFAULT 1,
            created_by_user_id INT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX conversations_updated_at_idx (updated_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS conversation_participants (
            id INT AUTO_INCREMENT PRIMARY KEY,
            conversation_id INT NOT NULL,
            user_id INT NOT NULL,
            joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_read_at DATETIME NULL,
            UNIQUE KEY conversation_participants_conversation_user_unique (conversation_id, user_id),
            INDEX conversation_participants_user_id_idx (user_id),
            CONSTRAINT conversation_participants_conversation_fk
                FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS messages (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            conversation_id INT NOT NULL,
            sender_user_id INT NOT NULL,
            content TEXT NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX messages_conversation_created_at_idx (conversation_id, created_at),
            INDEX messages_sender_user_id_idx (sender_user_id),
            CONSTRAINT messages_conversation_fk
                FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
}

function normalize_presence_status(?string $value): string {
    $status = strtolower(trim((string) $value));
    $allowed = ['available', 'busy', 'in_meeting', 'on_break', 'lunch', 'away', 'offline'];
    if (in_array($status, $allowed, true)) {
        return $status;
    }
    return 'available';
}

function presence_online_window_seconds(): int {
    $raw = (int) env('PRESENCE_ONLINE_WINDOW_SECONDS', '75');
    if ($raw < 30) {
        return 30;
    }
    if ($raw > 600) {
        return 600;
    }
    return $raw;
}

function is_presence_online(?string $status, ?string $lastSeen): bool {
    if (normalize_presence_status($status) === 'offline') {
        return false;
    }
    $lastSeenTs = $lastSeen ? strtotime($lastSeen) : false;
    if ($lastSeenTs === false) {
        return false;
    }
    $window = presence_online_window_seconds();
    return $lastSeenTs >= (time() - $window);
}

function ensure_default_messages_conversation(): int {
    static $cachedConversationId = null;
    if (is_int($cachedConversationId) && $cachedConversationId > 0) {
        return $cachedConversationId;
    }

    $pdo = db();
    $select = $pdo->prepare('SELECT id FROM conversations WHERE name = ? LIMIT 1');
    $select->execute(['Team General']);
    $row = $select->fetch();

    if ($row) {
        $cachedConversationId = (int) $row['id'];
    } else {
        $seedUserId = (int) $pdo->query('SELECT id FROM users ORDER BY id ASC LIMIT 1')->fetchColumn();
        $insert = $pdo->prepare(
            'INSERT INTO conversations (name, is_group, created_by_user_id, created_at, updated_at)
             VALUES (?, ?, ?, NOW(), NOW())'
        );
        $insert->execute(['Team General', 1, $seedUserId > 0 ? $seedUserId : null]);
        $cachedConversationId = (int) $pdo->lastInsertId();
    }

    if ($cachedConversationId > 0) {
        $users = $pdo->query('SELECT id FROM users')->fetchAll();
        $linkParticipant = $pdo->prepare(
            'INSERT IGNORE INTO conversation_participants (conversation_id, user_id, joined_at, last_read_at)
             VALUES (?, ?, NOW(), NOW())'
        );

        foreach ($users as $userRow) {
            $userId = (int) ($userRow['id'] ?? 0);
            if ($userId <= 0) {
                continue;
            }
            $linkParticipant->execute([$cachedConversationId, $userId]);
        }
    }

    return $cachedConversationId;
}

function find_direct_conversation_between_users(PDO $pdo, int $firstUserId, int $secondUserId): int {
    if ($firstUserId <= 0 || $secondUserId <= 0 || $firstUserId === $secondUserId) {
        return 0;
    }

    $stmt = $pdo->prepare(
        'SELECT c.id
         FROM conversations c
         INNER JOIN conversation_participants cp_first
            ON cp_first.conversation_id = c.id
           AND cp_first.user_id = ?
         INNER JOIN conversation_participants cp_second
            ON cp_second.conversation_id = c.id
           AND cp_second.user_id = ?
         WHERE
            c.is_group = 0
            AND (
                SELECT COUNT(*)
                FROM conversation_participants cp_count
                WHERE cp_count.conversation_id = c.id
            ) = 2
         ORDER BY c.id ASC
         LIMIT 1'
    );
    $stmt->execute([$firstUserId, $secondUserId]);

    return (int) $stmt->fetchColumn();
}

function ensure_direct_message_conversations_for_user(int $userId): void {
    if ($userId <= 0) {
        return;
    }

    $pdo = db();
    $usersStmt = $pdo->prepare(
        'SELECT id, name
         FROM users
         WHERE id <> ?
         ORDER BY name ASC, id ASC'
    );
    $usersStmt->execute([$userId]);
    $otherUsers = $usersStmt->fetchAll();

    $createConversation = $pdo->prepare(
        'INSERT INTO conversations (name, is_group, created_by_user_id, created_at, updated_at)
         VALUES (?, 0, ?, NOW(), NOW())'
    );
    $linkParticipant = $pdo->prepare(
        'INSERT IGNORE INTO conversation_participants (conversation_id, user_id, joined_at, last_read_at)
         VALUES (?, ?, NOW(), NOW())'
    );

    foreach ($otherUsers as $otherUser) {
        $otherUserId = (int) ($otherUser['id'] ?? 0);
        if ($otherUserId <= 0) {
            continue;
        }

        $conversationId = find_direct_conversation_between_users($pdo, $userId, $otherUserId);
        if ($conversationId <= 0) {
            $otherUserName = trim((string) ($otherUser['name'] ?? ''));
            $conversationName = $otherUserName !== '' ? $otherUserName : 'Direct Message';
            $createConversation->execute([$conversationName, $userId]);
            $conversationId = (int) $pdo->lastInsertId();
        }

        if ($conversationId <= 0) {
            continue;
        }

        $linkParticipant->execute([$conversationId, $userId]);
        $linkParticipant->execute([$conversationId, $otherUserId]);
    }
}

function user_can_access_conversation(int $conversationId, int $userId): bool {
    if ($conversationId <= 0 || $userId <= 0) {
        return false;
    }

    $stmt = db()->prepare(
        'SELECT 1
         FROM conversation_participants
         WHERE conversation_id = ? AND user_id = ?
         LIMIT 1'
    );
    $stmt->execute([$conversationId, $userId]);
    return (bool) $stmt->fetchColumn();
}

function xml_escape(string $value): string {
    return htmlspecialchars($value, ENT_XML1 | ENT_QUOTES, 'UTF-8');
}

function twiml_response(string $xml, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: text/xml; charset=UTF-8');
    echo $xml;
    exit;
}

function twilio_access_token_ttl_seconds(): int {
    $ttl = (int) env('TWILIO_ACCESS_TOKEN_TTL_SECONDS', '3600');
    if ($ttl < 60) {
        return 60;
    }
    if ($ttl > 86400) {
        return 86400;
    }
    return $ttl;
}

function twilio_normalize_us_e164(string $input): ?string {
    $trimmed = trim($input);
    if ($trimmed === '') {
        return null;
    }

    $digits = preg_replace('/\D+/', '', $trimmed);
    if (!is_string($digits) || $digits === '') {
        return null;
    }

    if (strlen($digits) === 11 && str_starts_with($digits, '1')) {
        $digits = substr($digits, 1);
    }
    if (strlen($digits) !== 10) {
        return null;
    }

    // Basic NANP checks.
    if (!preg_match('/^[2-9]\d{2}[2-9]\d{6}$/', $digits)) {
        return null;
    }

    return '+1' . $digits;
}

function twilio_parse_user_id_from_client(string $from): ?int {
    if (preg_match('/^client:user_(\d+)$/', trim($from), $matches) !== 1) {
        return null;
    }
    $id = (int) $matches[1];
    return $id > 0 ? $id : null;
}

function twilio_status_to_app_status(string $twilioStatus): string {
    $value = strtolower(trim($twilioStatus));
    if ($value === 'initiated' || $value === 'queued') {
        return 'queued';
    }
    if ($value === 'ringing') {
        return 'ringing';
    }
    if ($value === 'answered' || $value === 'in-progress' || $value === 'inprogress') {
        return 'in-progress';
    }
    if ($value === 'busy') {
        return 'busy';
    }
    if ($value === 'failed') {
        return 'failed';
    }
    if ($value === 'no-answer' || $value === 'noanswer') {
        return 'no-answer';
    }
    if ($value === 'canceled' || $value === 'cancelled') {
        return 'canceled';
    }
    if ($value === 'completed') {
        return 'completed';
    }
    return 'completed';
}

function twilio_is_terminal_status(string $status): bool {
    return in_array($status, ['completed', 'busy', 'failed', 'no-answer', 'canceled'], true);
}

function twilio_build_access_token(string $identity): string {
    $accountSid = (string) env('TWILIO_ACCOUNT_SID', '');
    $apiKeySid = (string) env('TWILIO_API_KEY_SID', '');
    $apiKeySecret = (string) env('TWILIO_API_KEY_SECRET', '');
    $twimlAppSid = (string) env('TWILIO_TWIML_APP_SID', '');

    if ($accountSid === '' || $apiKeySid === '' || $apiKeySecret === '' || $twimlAppSid === '') {
        throw new RuntimeException('Twilio configuration is incomplete.');
    }

    $now = time();
    $exp = $now + twilio_access_token_ttl_seconds();
    $payload = [
        'jti' => $apiKeySid . '-' . $now,
        'iss' => $apiKeySid,
        'sub' => $accountSid,
        'iat' => $now,
        'nbf' => $now,
        'exp' => $exp,
        'grants' => [
            'identity' => $identity,
            'voice' => [
                'outgoing' => [
                    'application_sid' => $twimlAppSid,
                ],
            ],
        ],
    ];

    $header = [
        'typ' => 'JWT',
        'alg' => 'HS256',
        'cty' => 'twilio-fpa;v=1',
    ];

    $encodedHeader = base64url_encode(json_encode($header, JSON_UNESCAPED_SLASHES));
    $encodedPayload = base64url_encode(json_encode($payload, JSON_UNESCAPED_SLASHES));
    $signatureBase = $encodedHeader . '.' . $encodedPayload;
    $signature = hash_hmac('sha256', $signatureBase, $apiKeySecret, true);

    return $signatureBase . '.' . base64url_encode($signature);
}

function twilio_public_base_url(): string {
    $configured = trim((string) env('TWILIO_PUBLIC_BASE_URL', 'https://sthillstudios.com/employeelogin/api'));
    return rtrim($configured, '/');
}

function twilio_webhook_url_for_route(string $route): string {
    return twilio_public_base_url() . '/' . ltrim($route, '/');
}

function twilio_should_validate_signature(): bool {
    return env_bool('TWILIO_VALIDATE_SIGNATURE', true);
}

function twilio_validate_signature(string $route, array $params): bool {
    if (!twilio_should_validate_signature()) {
        return true;
    }

    $authToken = (string) env('TWILIO_AUTH_TOKEN', '');
    $signature = (string) ($_SERVER['HTTP_X_TWILIO_SIGNATURE'] ?? '');
    if ($authToken === '' || $signature === '') {
        return false;
    }

    $url = twilio_webhook_url_for_route($route);
    ksort($params);
    $signatureBase = $url;
    foreach ($params as $key => $value) {
        if (is_array($value)) {
            $values = $value;
            sort($values, SORT_STRING);
            foreach ($values as $entry) {
                $signatureBase .= $key . (string) $entry;
            }
            continue;
        }
        $signatureBase .= $key . (string) $value;
    }

    $expected = base64_encode(hash_hmac('sha1', $signatureBase, $authToken, true));
    return hash_equals($expected, $signature);
}

function telnyx_access_token_ttl_seconds(): int {
    $ttl = (int) env('TELNYX_ACCESS_TOKEN_TTL_SECONDS', '3600');
    if ($ttl < 60) {
        return 60;
    }
    if ($ttl > 86400) {
        return 86400;
    }
    return $ttl;
}

function telnyx_api_base_url(): string {
    $configured = trim((string) env('TELNYX_API_BASE_URL', 'https://api.telnyx.com/v2'));
    return rtrim($configured, '/');
}

function telnyx_extract_token_from_response(string $body): string {
    $decoded = json_decode($body, true);
    if (is_array($decoded)) {
        $topLevel = trim((string) ($decoded['token'] ?? ''));
        if ($topLevel !== '') {
            return $topLevel;
        }

        $data = $decoded['data'] ?? null;
        if (is_string($data) && trim($data) !== '') {
            return trim($data);
        }
        if (is_array($data)) {
            $nested = trim((string) ($data['token'] ?? ''));
            if ($nested !== '') {
                return $nested;
            }
        }
    }

    $raw = trim($body);
    if ($raw !== '' && !str_starts_with($raw, '{') && !str_starts_with($raw, '[')) {
        return $raw;
    }

    return '';
}

function telnyx_extract_error_message(string $body): string {
    $decoded = json_decode($body, true);
    if (!is_array($decoded)) {
        return '';
    }

    $candidates = [];

    $topLevel = trim((string) ($decoded['message'] ?? ''));
    if ($topLevel !== '') {
        $candidates[] = $topLevel;
    }

    $errors = $decoded['errors'] ?? null;
    if (is_array($errors)) {
        foreach ($errors as $error) {
            if (!is_array($error)) {
                continue;
            }
            $detail = trim((string) ($error['detail'] ?? ''));
            $title = trim((string) ($error['title'] ?? ''));
            $code = trim((string) ($error['code'] ?? ''));
            foreach ([$detail, $title, $code] as $value) {
                if ($value !== '') {
                    $candidates[] = $value;
                }
            }
        }
    }

    $error = $decoded['error'] ?? null;
    if (is_array($error)) {
        foreach (['message', 'detail', 'title', 'code'] as $field) {
            $value = trim((string) ($error[$field] ?? ''));
            if ($value !== '') {
                $candidates[] = $value;
            }
        }
    } elseif (is_string($error) && trim($error) !== '') {
        $candidates[] = trim($error);
    }

    $unique = [];
    foreach ($candidates as $candidate) {
        if (!in_array($candidate, $unique, true)) {
            $unique[] = $candidate;
        }
    }

    return trim(implode(' | ', $unique));
}

function telnyx_decode_jwt_exp(string $token): ?int {
    $parts = explode('.', $token);
    if (count($parts) !== 3) {
        return null;
    }

    $payload = json_decode(base64url_decode($parts[1]), true);
    if (!is_array($payload)) {
        return null;
    }

    $exp = $payload['exp'] ?? null;
    if (!is_int($exp) && !is_numeric($exp)) {
        return null;
    }

    $value = (int) $exp;
    return $value > 0 ? $value : null;
}

function telnyx_normalize_phone_number(string $value): string {
    $trimmed = trim($value);
    if ($trimmed === '') {
        return '';
    }

    if (str_starts_with($trimmed, '+')) {
        $digits = preg_replace('/\D+/', '', substr($trimmed, 1));
        if (is_string($digits) && strlen($digits) >= 8 && strlen($digits) <= 15) {
            return '+' . $digits;
        }
        return '';
    }

    $digits = preg_replace('/\D+/', '', $trimmed);
    if (!is_string($digits) || strlen($digits) < 8 || strlen($digits) > 15) {
        return '';
    }

    return '+' . $digits;
}

function telnyx_configured_caller_numbers(): array {
    $rawList = trim((string) env('TELNYX_CALLER_NUMBERS', ''));
    $legacySingle = trim((string) env('TELNYX_CALLER_NUMBER', ''));

    $values = [];
    if ($rawList !== '') {
        $values = preg_split('/[\s,]+/', $rawList) ?: [];
    } elseif ($legacySingle !== '') {
        $values = [$legacySingle];
    }

    $normalized = [];
    foreach ($values as $value) {
        $number = telnyx_normalize_phone_number((string) $value);
        if ($number === '' || in_array($number, $normalized, true)) {
            continue;
        }
        $normalized[] = $number;
    }

    return $normalized;
}

function telnyx_http_post_json(string $url, string $apiKey, ?array $payload = null): array {
    $body = '';
    if ($payload !== null) {
        $encoded = json_encode($payload, JSON_UNESCAPED_SLASHES);
        if (!is_string($encoded)) {
            throw new RuntimeException('Failed to encode Telnyx payload.');
        }
        $body = $encoded;
    }

    $headers = [
        'Authorization: Bearer ' . $apiKey,
        'Content-Type: application/json',
        'Accept: application/json',
    ];

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        if ($ch === false) {
            throw new RuntimeException('Failed to initialize Telnyx HTTP client.');
        }

        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        if ($body !== '') {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        }
        curl_setopt($ch, CURLOPT_TIMEOUT, 20);

        $responseBody = curl_exec($ch);
        $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($responseBody === false) {
            throw new RuntimeException($curlError !== '' ? $curlError : 'Failed to reach Telnyx API.');
        }

        return [
            'status' => $httpCode,
            'body' => (string) $responseBody,
        ];
    }

    $context = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => implode("\r\n", $headers),
            'timeout' => 20,
            'ignore_errors' => true,
        ],
    ]);
    if ($body !== '') {
        $options = stream_context_get_options($context);
        $options['http']['content'] = $body;
        $context = stream_context_create($options);
    }

    $responseBody = @file_get_contents($url, false, $context);
    $status = 0;
    $responseHeaders = [];
    if (function_exists('http_get_last_response_headers')) {
        $headers = http_get_last_response_headers();
        if (is_array($headers)) {
            $responseHeaders = $headers;
        }
    }
    if (isset($responseHeaders[0]) && preg_match('#HTTP/\S+\s+(\d{3})#', (string) $responseHeaders[0], $matches) === 1) {
        $status = (int) $matches[1];
    }
    if ($responseBody === false) {
        throw new RuntimeException('Failed to reach Telnyx API.');
    }
    if ($status === 0) {
        // Older PHP versions may not expose response headers for stream wrappers.
        $status = 200;
    }

    return [
        'status' => $status,
        'body' => (string) $responseBody,
    ];
}

function telnyx_issue_access_token(): array {
    $apiKey = trim((string) env('TELNYX_API_KEY', ''));
    $credentialId = trim((string) env('TELNYX_TELEPHONY_CREDENTIAL_ID', ''));
    $callerNumbers = telnyx_configured_caller_numbers();
    $callerNumber = $callerNumbers[0] ?? '';

    if ($apiKey === '' || $credentialId === '' || $callerNumber === '') {
        throw new RuntimeException('Telnyx configuration is incomplete.');
    }

    $url = telnyx_api_base_url() . '/telephony_credentials/' . rawurlencode($credentialId) . '/token';
    $response = telnyx_http_post_json($url, $apiKey);

    $status = (int) ($response['status'] ?? 0);
    $body = (string) ($response['body'] ?? '');

    if ($status < 200 || $status >= 300) {
        $errorMessage = telnyx_extract_error_message($body);
        if ($errorMessage !== '') {
            throw new RuntimeException(sprintf(
                'Unable to generate Telnyx access token (HTTP %d: %s).',
                $status,
                $errorMessage
            ));
        }

        throw new RuntimeException(sprintf(
            'Unable to generate Telnyx access token (HTTP %d).',
            $status
        ));
    }

    $token = telnyx_extract_token_from_response($body);
    if ($token === '') {
        throw new RuntimeException('Unexpected Telnyx access token response.');
    }

    $tokenExp = telnyx_decode_jwt_exp($token);
    $effectiveExp = $tokenExp !== null ? $tokenExp : (time() + telnyx_access_token_ttl_seconds());

    return [
        'token' => $token,
        'caller_number' => $callerNumber,
        'caller_numbers' => $callerNumbers,
        'expires_at' => gmdate('c', $effectiveExp),
        'expires_in' => max(0, $effectiveExp - time()),
    ];
}
