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
