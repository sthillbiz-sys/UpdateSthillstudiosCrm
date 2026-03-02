<?php
/**
 * Google Drive OAuth2 Authorization Endpoint
 * Initiates OAuth flow for Google Drive access
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/includes/auth.php';

// Verify user is authenticated
$user = authenticateRequest();
if (!$user) {
    http_response_code(401);
    echo json_encode(['error' => 'Authentication required']);
    exit;
}

// Check if Google Drive is configured
if (empty(GOOGLE_DRIVE_CLIENT_ID) || empty(GOOGLE_DRIVE_CLIENT_SECRET)) {
    http_response_code(503);
    echo json_encode([
        'error' => 'Google Drive integration not configured',
        'message' => 'Please contact support to enable Google Drive export'
    ]);
    exit;
}

$action = $_GET['action'] ?? 'auth';

switch ($action) {
    case 'auth':
        // Generate OAuth URL
        $state = bin2hex(random_bytes(16));
        $_SESSION['google_drive_state'] = $state;
        $_SESSION['google_drive_user_id'] = $user['id'];
        
        $params = http_build_query([
            'client_id' => GOOGLE_DRIVE_CLIENT_ID,
            'redirect_uri' => GOOGLE_DRIVE_REDIRECT_URI,
            'response_type' => 'code',
            'scope' => 'https://www.googleapis.com/auth/drive.file',
            'access_type' => 'offline',
            'prompt' => 'consent',
            'state' => $state
        ]);
        
        $authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' . $params;
        
        echo json_encode([
            'success' => true,
            'auth_url' => $authUrl
        ]);
        break;
        
    case 'status':
        // Check if user has Google Drive connected
        try {
            require_once __DIR__ . '/includes/database.php';
            $db = getDB();
            $pdo = $db->getConnection();
            
            $stmt = $pdo->prepare('SELECT google_drive_token, google_drive_refresh_token FROM users WHERE id = ?');
            $stmt->execute([$user['id']]);
            $userData = $stmt->fetch(PDO::FETCH_ASSOC);
            
            $connected = !empty($userData['google_drive_token']) || !empty($userData['google_drive_refresh_token']);
            
            echo json_encode([
                'success' => true,
                'connected' => $connected
            ]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Database error']);
        }
        break;
        
    case 'disconnect':
        // Remove Google Drive tokens
        try {
            require_once __DIR__ . '/includes/database.php';
            $db = getDB();
            $pdo = $db->getConnection();
            
            $stmt = $pdo->prepare('UPDATE users SET google_drive_token = NULL, google_drive_refresh_token = NULL WHERE id = ?');
            $stmt->execute([$user['id']]);
            
            echo json_encode([
                'success' => true,
                'message' => 'Google Drive disconnected'
            ]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to disconnect']);
        }
        break;
        
    default:
        http_response_code(400);
        echo json_encode(['error' => 'Invalid action']);
}
