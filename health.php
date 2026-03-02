<?php
/**
 * Google Drive OAuth2 Callback Handler
 * Exchanges authorization code for access token
 */

session_start();

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/includes/database.php';

// Verify state to prevent CSRF
$state = $_GET['state'] ?? '';
$storedState = $_SESSION['google_drive_state'] ?? '';
$userId = $_SESSION['google_drive_user_id'] ?? null;

if (empty($state) || $state !== $storedState || !$userId) {
    header('Location: ' . FRONTEND_URL . '/dashboard?drive_error=invalid_state');
    exit;
}

// Check for error from Google
if (!empty($_GET['error'])) {
    header('Location: ' . FRONTEND_URL . '/dashboard?drive_error=' . urlencode($_GET['error']));
    exit;
}

$code = $_GET['code'] ?? '';
if (empty($code)) {
    header('Location: ' . FRONTEND_URL . '/dashboard?drive_error=no_code');
    exit;
}

// Exchange code for tokens
$tokenUrl = 'https://oauth2.googleapis.com/token';
$tokenData = [
    'client_id' => GOOGLE_DRIVE_CLIENT_ID,
    'client_secret' => GOOGLE_DRIVE_CLIENT_SECRET,
    'code' => $code,
    'grant_type' => 'authorization_code',
    'redirect_uri' => GOOGLE_DRIVE_REDIRECT_URI
];

$ch = curl_init($tokenUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($tokenData));
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/x-www-form-urlencoded']);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($httpCode !== 200) {
    header('Location: ' . FRONTEND_URL . '/dashboard?drive_error=token_exchange_failed');
    exit;
}

$tokens = json_decode($response, true);
if (empty($tokens['access_token'])) {
    header('Location: ' . FRONTEND_URL . '/dashboard?drive_error=no_access_token');
    exit;
}

// Store tokens in database
try {
    $db = getDB();
    $pdo = $db->getConnection();
    
    $stmt = $pdo->prepare('UPDATE users SET google_drive_token = ?, google_drive_refresh_token = ? WHERE id = ?');
    $stmt->execute([
        $tokens['access_token'],
        $tokens['refresh_token'] ?? null,
        $userId
    ]);
    
    // Clear session state
    unset($_SESSION['google_drive_state']);
    unset($_SESSION['google_drive_user_id']);
    
    header('Location: ' . FRONTEND_URL . '/dashboard?drive_connected=true');
} catch (Exception $e) {
    header('Location: ' . FRONTEND_URL . '/dashboard?drive_error=database_error');
}
