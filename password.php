<?php
/**
 * Google Drive Export Endpoint
 * Exports verified leads to user's Google Drive
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/includes/database.php';

// Verify user is authenticated
$user = authenticateRequest();
if (!$user) {
    http_response_code(401);
    echo json_encode(['error' => 'Authentication required']);
    exit;
}

// Get user's Google Drive token
$db = getDB();
$pdo = $db->getConnection();

$stmt = $pdo->prepare('SELECT google_drive_token, google_drive_refresh_token FROM users WHERE id = ?');
$stmt->execute([$user['id']]);
$userData = $stmt->fetch(PDO::FETCH_ASSOC);

if (empty($userData['google_drive_token']) && empty($userData['google_drive_refresh_token'])) {
    http_response_code(403);
    echo json_encode([
        'error' => 'Google Drive not connected',
        'needs_auth' => true
    ]);
    exit;
}

$accessToken = $userData['google_drive_token'];

// Try to refresh token if we have a refresh token
if (!empty($userData['google_drive_refresh_token'])) {
    $refreshResponse = refreshGoogleToken($userData['google_drive_refresh_token']);
    if ($refreshResponse) {
        $accessToken = $refreshResponse['access_token'];
        
        // Update stored token
        $stmt = $pdo->prepare('UPDATE users SET google_drive_token = ? WHERE id = ?');
        $stmt->execute([$accessToken, $user['id']]);
    }
}

// Get leads data from request
$input = json_decode(file_get_contents('php://input'), true);
$leads = $input['leads'] ?? [];
$filename = $input['filename'] ?? 'verified-leads-' . date('Y-m-d');

if (empty($leads)) {
    http_response_code(400);
    echo json_encode(['error' => 'No leads provided']);
    exit;
}

// Create CSV content
$csvLines = [];
$csvLines[] = implode(',', ['Name', 'Email', 'Phone', 'Website', 'Lead Score', 'Priority', 'Best Contact Time', 'Marketing Angle', 'Predicted Response', 'Email Valid', 'Talking Points', 'Pain Points']);

foreach ($leads as $lead) {
    $csvLines[] = implode(',', [
        '"' . str_replace('"', '""', $lead['name'] ?? '') . '"',
        '"' . str_replace('"', '""', $lead['email'] ?? '') . '"',
        '"' . str_replace('"', '""', $lead['phone'] ?? '') . '"',
        '"' . str_replace('"', '""', $lead['website'] ?? '') . '"',
        $lead['leadScore'] ?? '',
        $lead['conversionProbability'] ?? '',
        '"' . str_replace('"', '""', $lead['bestContactTime'] ?? '') . '"',
        '"' . str_replace('"', '""', $lead['marketingAngle'] ?? '') . '"',
        ($lead['predictedResponse'] ?? '') . '%',
        ($lead['emailValid'] ?? false) ? 'Yes' : 'No',
        '"' . str_replace('"', '""', implode('; ', $lead['talkingPoints'] ?? [])) . '"',
        '"' . str_replace('"', '""', implode('; ', $lead['painPoints'] ?? [])) . '"'
    ]);
}

$csvContent = implode("\n", $csvLines);

// Upload to Google Drive
$boundary = '-------' . uniqid();
$delimiter = "\r\n--" . $boundary . "\r\n";
$closeDelimiter = "\r\n--" . $boundary . "--";

$metadata = json_encode([
    'name' => $filename . '.csv',
    'mimeType' => 'text/csv'
]);

$body = $delimiter .
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" .
    $metadata .
    $delimiter .
    "Content-Type: text/csv\r\n\r\n" .
    $csvContent .
    $closeDelimiter;

$ch = curl_init('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Authorization: Bearer ' . $accessToken,
    'Content-Type: multipart/related; boundary=' . $boundary,
    'Content-Length: ' . strlen($body)
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($httpCode === 401) {
    // Token expired, need re-auth
    $stmt = $pdo->prepare('UPDATE users SET google_drive_token = NULL WHERE id = ?');
    $stmt->execute([$user['id']]);
    
    http_response_code(403);
    echo json_encode([
        'error' => 'Google Drive token expired',
        'needs_auth' => true
    ]);
    exit;
}

if ($httpCode !== 200) {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to upload to Google Drive', 'details' => $response]);
    exit;
}

$fileData = json_decode($response, true);

echo json_encode([
    'success' => true,
    'file_id' => $fileData['id'],
    'file_name' => $filename . '.csv',
    'web_view_link' => 'https://drive.google.com/file/d/' . $fileData['id'] . '/view'
]);

/**
 * Refresh Google access token
 */
function refreshGoogleToken($refreshToken) {
    $ch = curl_init('https://oauth2.googleapis.com/token');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query([
        'client_id' => GOOGLE_DRIVE_CLIENT_ID,
        'client_secret' => GOOGLE_DRIVE_CLIENT_SECRET,
        'refresh_token' => $refreshToken,
        'grant_type' => 'refresh_token'
    ]));
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/x-www-form-urlencoded']);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($httpCode === 200) {
        return json_decode($response, true);
    }
    return null;
}
