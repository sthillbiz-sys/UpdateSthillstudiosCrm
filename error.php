<?php
/**
 * System Diagnostics Endpoint
 * Comprehensive check of all backend systems
 * 
 * Access: https://bamlead.com/api/diagnostics.php?key=YOUR_CRON_SECRET_KEY
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

// Security check
$cronKey = $_GET['key'] ?? '';
$configExists = file_exists(__DIR__ . '/config.php');

if ($configExists) {
    require_once __DIR__ . '/config.php';
    if (defined('CRON_SECRET_KEY') && $cronKey !== CRON_SECRET_KEY) {
        // Allow without key if DEBUG_MODE is on
        if (!defined('DEBUG_MODE') || !DEBUG_MODE) {
            http_response_code(403);
            echo json_encode(['error' => 'Invalid key. Add ?key=YOUR_CRON_SECRET_KEY']);
            exit;
        }
    }
}

$results = [
    'timestamp' => date('c'),
    'php_version' => PHP_VERSION,
    'checks' => []
];

// 1. Check file structure
$requiredFiles = [
    'config.php' => __DIR__ . '/config.php',
    'includes/auth.php' => __DIR__ . '/includes/auth.php',
    'includes/database.php' => __DIR__ . '/includes/database.php',
    'includes/email.php' => __DIR__ . '/includes/email.php',
    'includes/functions.php' => __DIR__ . '/includes/functions.php',
    'includes/ratelimit.php' => __DIR__ . '/includes/ratelimit.php',
    'health.php' => __DIR__ . '/health.php',
    'auth.php' => __DIR__ . '/auth.php',
    'gmb-search.php' => __DIR__ . '/gmb-search.php',
    'email-outreach.php' => __DIR__ . '/email-outreach.php',
    'analyze-leads.php' => __DIR__ . '/analyze-leads.php',
    'cron-email.php' => __DIR__ . '/cron-email.php',
];

$fileResults = [];
foreach ($requiredFiles as $name => $path) {
    $fileResults[$name] = file_exists($path);
}
$results['checks']['files'] = [
    'status' => !in_array(false, $fileResults) ? 'ok' : 'missing',
    'details' => $fileResults
];

// 2. Check config.php values
$configChecks = [];
if ($configExists) {
    $configChecks['DB_HOST'] = defined('DB_HOST') && !empty(DB_HOST);
    $configChecks['DB_NAME'] = defined('DB_NAME') && !empty(DB_NAME);
    $configChecks['DB_USER'] = defined('DB_USER') && !empty(DB_USER);
    $configChecks['DB_PASS'] = defined('DB_PASS') && DB_PASS !== 'YOUR_DATABASE_PASSWORD_HERE';
    $configChecks['SERPAPI_KEY'] = defined('SERPAPI_KEY') && !empty(SERPAPI_KEY) && SERPAPI_KEY !== 'YOUR_SERPAPI_KEY_HERE';
    $configChecks['SMTP_HOST'] = defined('SMTP_HOST') && !empty(SMTP_HOST);
    $configChecks['SMTP_USER'] = defined('SMTP_USER') && !empty(SMTP_USER);
    $configChecks['SMTP_PASS'] = defined('SMTP_PASS') && SMTP_PASS !== 'YOUR_NOREPLY_EMAIL_PASSWORD';
    $configChecks['JWT_SECRET'] = defined('JWT_SECRET') && JWT_SECRET !== 'REPLACE_WITH_RANDOM_32_CHAR_STRING';
    $configChecks['CRON_SECRET_KEY'] = defined('CRON_SECRET_KEY') && !empty(CRON_SECRET_KEY);
    $configChecks['STRIPE_SECRET_KEY'] = defined('STRIPE_SECRET_KEY') && strpos(STRIPE_SECRET_KEY, 'sk_') === 0;
    $configChecks['OPENAI_API_KEY'] = defined('OPENAI_API_KEY') && strpos(OPENAI_API_KEY, 'sk-') === 0;
}
$results['checks']['config'] = [
    'status' => $configExists ? (!in_array(false, $configChecks) ? 'ok' : 'incomplete') : 'missing',
    'details' => $configChecks
];

// 3. Check database connection
$dbStatus = ['connected' => false, 'tables' => []];
if ($configExists && defined('DB_HOST')) {
    try {
        require_once __DIR__ . '/includes/database.php';
        $db = getDB();
        $pdo = $db->getConnection();
        $dbStatus['connected'] = true;
        
        // Check required tables
        $requiredTables = ['users', 'sessions', 'email_templates', 'email_campaigns', 'email_sends', 'verified_leads', 'rate_limits'];
        foreach ($requiredTables as $table) {
            try {
                $stmt = $pdo->query("SELECT 1 FROM $table LIMIT 1");
                $dbStatus['tables'][$table] = true;
            } catch (Exception $e) {
                $dbStatus['tables'][$table] = false;
            }
        }
    } catch (Exception $e) {
        $dbStatus['error'] = $e->getMessage();
    }
}
$results['checks']['database'] = [
    'status' => $dbStatus['connected'] ? 'ok' : 'error',
    'details' => $dbStatus
];

// 4. Check SMTP connection
$smtpStatus = ['configured' => false, 'test_result' => null];
if ($configExists && defined('SMTP_HOST') && defined('SMTP_USER') && defined('SMTP_PASS')) {
    $smtpStatus['configured'] = true;
    
    // Try to open socket connection to SMTP
    $errno = 0;
    $errstr = '';
    $timeout = 5;
    $smtpPort = defined('SMTP_PORT') ? SMTP_PORT : 465;
    
    $socket = @fsockopen('ssl://' . SMTP_HOST, $smtpPort, $errno, $errstr, $timeout);
    if ($socket) {
        $smtpStatus['test_result'] = 'Connection successful';
        $smtpStatus['reachable'] = true;
        fclose($socket);
    } else {
        $smtpStatus['test_result'] = "Failed: $errstr ($errno)";
        $smtpStatus['reachable'] = false;
    }
}
$results['checks']['smtp'] = [
    'status' => ($smtpStatus['configured'] && ($smtpStatus['reachable'] ?? false)) ? 'ok' : 'error',
    'details' => $smtpStatus
];

// 5. Check SerpAPI
$serpStatus = ['configured' => false, 'test_result' => null];
if ($configExists && defined('SERPAPI_KEY') && SERPAPI_KEY !== 'YOUR_SERPAPI_KEY_HERE') {
    $serpStatus['configured'] = true;
    
    // Quick account check
    $ch = curl_init('https://serpapi.com/account.json?api_key=' . SERPAPI_KEY);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 5);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($httpCode === 200) {
        $data = json_decode($response, true);
        $serpStatus['test_result'] = 'Valid';
        $serpStatus['searches_remaining'] = $data['total_searches_left'] ?? 'unknown';
    } else {
        $serpStatus['test_result'] = 'Invalid or expired key';
    }
}
$results['checks']['serpapi'] = [
    'status' => ($serpStatus['configured'] && $serpStatus['test_result'] === 'Valid') ? 'ok' : 'error',
    'details' => $serpStatus
];

// 6. Check Stripe
$stripeStatus = ['configured' => false];
if ($configExists && defined('STRIPE_SECRET_KEY') && strpos(STRIPE_SECRET_KEY, 'sk_') === 0) {
    $stripeStatus['configured'] = true;
    $stripeStatus['mode'] = strpos(STRIPE_SECRET_KEY, 'sk_live_') === 0 ? 'live' : 'test';
    
    // Quick API check
    $ch = curl_init('https://api.stripe.com/v1/balance');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Authorization: Bearer ' . STRIPE_SECRET_KEY]);
    curl_setopt($ch, CURLOPT_TIMEOUT, 5);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    $stripeStatus['api_reachable'] = $httpCode === 200;
}
$results['checks']['stripe'] = [
    'status' => ($stripeStatus['configured'] && ($stripeStatus['api_reachable'] ?? false)) ? 'ok' : 'error',
    'details' => $stripeStatus
];

// Overall status
$allOk = true;
foreach ($results['checks'] as $check) {
    if ($check['status'] !== 'ok') {
        $allOk = false;
        break;
    }
}
$results['overall_status'] = $allOk ? 'all_systems_go' : 'needs_attention';

// Summary of issues
$issues = [];
if ($results['checks']['files']['status'] !== 'ok') {
    $missing = array_keys(array_filter($results['checks']['files']['details'], fn($v) => !$v));
    $issues[] = "Missing files: " . implode(', ', $missing);
}
if ($results['checks']['config']['status'] !== 'ok') {
    $missing = array_keys(array_filter($results['checks']['config']['details'], fn($v) => !$v));
    $issues[] = "Config incomplete: " . implode(', ', $missing);
}
if ($results['checks']['database']['status'] !== 'ok') {
    $issues[] = "Database: " . ($results['checks']['database']['details']['error'] ?? 'Not connected');
}
if ($results['checks']['smtp']['status'] !== 'ok') {
    $issues[] = "SMTP: " . ($results['checks']['smtp']['details']['test_result'] ?? 'Not configured');
}
if ($results['checks']['serpapi']['status'] !== 'ok') {
    $issues[] = "SerpAPI: " . ($results['checks']['serpapi']['details']['test_result'] ?? 'Not configured');
}
if ($results['checks']['stripe']['status'] !== 'ok') {
    $issues[] = "Stripe: Not configured or unreachable";
}

$results['issues'] = $issues;

echo json_encode($results, JSON_PRETTY_PRINT);
