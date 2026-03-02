<?php
/**
 * Health Check Endpoint
 * Returns JSON status to verify API is reachable and configured correctly
 * Deployed: 2026-01-10 v4
 * Trigger full API sync to Hostinger
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$checks = [
    'api' => true,
    'php_version' => PHP_VERSION,
    'timestamp' => date('c'),
];

// Check if includes exist
$checks['includes_exists'] = file_exists(__DIR__ . '/includes/functions.php');
$checks['auth_exists'] = file_exists(__DIR__ . '/includes/auth.php');
$checks['database_exists'] = file_exists(__DIR__ . '/includes/database.php');

// Check if config exists
$checks['config_exists'] = file_exists(__DIR__ . '/config.php');

// Try to load database connection
if ($checks['config_exists'] && $checks['database_exists']) {
    try {
        require_once __DIR__ . '/config.php';
        require_once __DIR__ . '/includes/database.php';

        $db = getDB();
        $pdo = $db->getConnection();
        $checks['database_connected'] = $pdo instanceof PDO;
    } catch (Exception $e) {
        $checks['database_connected'] = false;
        $checks['database_error'] = $e->getMessage();
    }
} else {
    $checks['database_connected'] = false;
}

// Overall status
$allGood = $checks['includes_exists'] && $checks['auth_exists'] && $checks['database_exists'] && $checks['config_exists'] && $checks['database_connected'];

echo json_encode([
    'status' => $allGood ? 'ok' : 'degraded',
    'version' => '1.0.2',
    'deployed' => '2025-01-04T06:00:00Z',
    'checks' => $checks,
], JSON_PRETTY_PRINT);
