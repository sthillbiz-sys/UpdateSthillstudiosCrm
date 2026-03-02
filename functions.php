<?php
/**
 * Authentication Helper Functions for BamLead
 */

require_once __DIR__ . '/database.php';
require_once __DIR__ . '/functions.php';

/**
 * Start secure session
 */
function startSecureSession() {
    if (session_status() === PHP_SESSION_NONE) {
        // Secure session settings
        ini_set('session.cookie_httponly', 1);
        ini_set('session.use_only_cookies', 1);
        ini_set('session.cookie_samesite', 'Lax');
        
        if (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') {
            ini_set('session.cookie_secure', 1);
        }
        
        session_start();
    }
}

/**
 * Generate a secure token
 */
function generateToken($length = 32) {
    return bin2hex(random_bytes($length));
}

/**
 * Hash a password securely
 */
function hashPassword($password) {
    return password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
}

/**
 * Verify a password against a hash
 */
function verifyPassword($password, $hash) {
    return password_verify($password, $hash);
}

/**
 * Create a new user
 */
function createUser($email, $password, $name = null) {
    $db = getDB();
    
    // Check if email already exists
    $existing = $db->fetchOne(
        "SELECT id FROM users WHERE email = ?",
        [strtolower($email)]
    );
    
    if ($existing) {
        return ['success' => false, 'error' => 'Email already registered'];
    }
    
    // Set trial end date (14 days from now)
    $trialEndsAt = date('Y-m-d H:i:s', strtotime('+14 days'));
    
    try {
        $userId = $db->insert(
            "INSERT INTO users (email, password_hash, name, trial_ends_at) VALUES (?, ?, ?, ?)",
            [strtolower($email), hashPassword($password), $name, $trialEndsAt]
        );
        
        return ['success' => true, 'user_id' => $userId];
    } catch (Exception $e) {
        return ['success' => false, 'error' => 'Failed to create user'];
    }
}

/**
 * Authenticate a user
 */
function authenticateUser($email, $password) {
    $db = getDB();
    
    // Check for login rate limiting (prevent brute force)
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $failedAttempts = $db->fetchOne(
        "SELECT COUNT(*) as count FROM login_attempts WHERE ip_address = ? AND attempted_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE) AND success = 0",
        [$ip]
    );
    
    if ($failedAttempts && $failedAttempts['count'] >= 5) {
        return ['success' => false, 'error' => 'Too many failed attempts. Please try again in 15 minutes.'];
    }
    
    $user = $db->fetchOne(
        "SELECT * FROM users WHERE email = ?",
        [strtolower($email)]
    );
    
    if (!$user) {
        // Record failed attempt
        recordLoginAttempt($db, $ip, null, false);
        return ['success' => false, 'error' => 'Invalid email or password'];
    }
    
    if (!verifyPassword($password, $user['password_hash'])) {
        // Record failed attempt
        recordLoginAttempt($db, $ip, $user['id'], false);
        return ['success' => false, 'error' => 'Invalid email or password'];
    }
    
    // Record successful login
    recordLoginAttempt($db, $ip, $user['id'], true);
    
    // Update last login
    $db->update(
        "UPDATE users SET last_login_at = NOW() WHERE id = ?",
        [$user['id']]
    );
    
    // Create session - regenerate session ID to prevent session fixation
    startSecureSession();
    session_regenerate_id(true);
    $sessionToken = generateToken();
    
    // Store session in database
    $expiresAt = date('Y-m-d H:i:s', strtotime('+7 days'));
    $db->insert(
        "INSERT INTO sessions (id, user_id, ip_address, user_agent, expires_at) VALUES (?, ?, ?, ?, ?)",
        [
            $sessionToken,
            $user['id'],
            $ip,
            substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 255),
            $expiresAt
        ]
    );
    
    // Set session variables
    $_SESSION['user_id'] = $user['id'];
    $_SESSION['session_token'] = $sessionToken;
    
    // Remove sensitive data
    unset($user['password_hash']);
    
    return [
        'success' => true,
        'user' => $user,
        'token' => $sessionToken,
        'expires_at' => $expiresAt
    ];
}

/**
 * Record login attempt for rate limiting
 */
function recordLoginAttempt($db, $ip, $userId, $success) {
    try {
        $db->insert(
            "INSERT INTO login_attempts (ip_address, user_id, success, attempted_at) VALUES (?, ?, ?, NOW())",
            [$ip, $userId, $success ? 1 : 0]
        );
    } catch (Exception $e) {
        // Table may not exist yet, fail silently
        error_log("Login attempt tracking failed: " . $e->getMessage());
    }
}

/**
 * Validate session token from header or session
 */
function validateSession($token = null) {
    $db = getDB();
    
    // Try to get token from Authorization header
    if (!$token) {
        $headers = getallheaders();
        $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';
        if (preg_match('/Bearer\s+(.+)$/i', $authHeader, $matches)) {
            $token = $matches[1];
        }
    }
    
    // Try session if no token
    if (!$token) {
        startSecureSession();
        $token = $_SESSION['session_token'] ?? null;
    }
    
    if (!$token) {
        return null;
    }
    
    // Check session in database
    $session = $db->fetchOne(
        "SELECT s.*, u.* FROM sessions s 
         JOIN users u ON s.user_id = u.id 
         WHERE s.id = ? AND s.expires_at > NOW()",
        [$token]
    );
    
    if (!$session) {
        return null;
    }
    
    // Remove sensitive data
    unset($session['password_hash']);
    
    return $session;
}

/**
 * Get current authenticated user
 */
function getCurrentUser() {
    return validateSession();
}

/**
 * Require authentication (or send 401)
 */
function requireAuth() {
    $user = getCurrentUser();
    
    if (!$user) {
        sendError('Unauthorized', 401);
        exit;
    }
    
    return $user;
}

/**
 * Require admin role
 */
function requireAdmin() {
    $user = requireAuth();
    
    if ($user['role'] !== 'admin' && !$user['is_owner']) {
        sendError('Forbidden', 403);
        exit;
    }
    
    return $user;
}

/**
 * Check if user has active subscription
 */
function hasActiveSubscription($user) {
    // Owner always has access
    if ($user['is_owner']) {
        return true;
    }
    
    // Admin always has access
    if ($user['role'] === 'admin') {
        return true;
    }
    
    // Check subscription status
    if ($user['subscription_status'] === 'active') {
        if ($user['subscription_ends_at'] && strtotime($user['subscription_ends_at']) < time()) {
            return false;
        }
        return true;
    }
    
    // Check trial
    if ($user['subscription_status'] === 'trial') {
        if ($user['trial_ends_at'] && strtotime($user['trial_ends_at']) > time()) {
            return true;
        }
        return false;
    }
    
    // Free tier - limited access
    if ($user['subscription_status'] === 'free') {
        return true; // Limited features
    }
    
    return false;
}

/**
 * Logout user
 */
function logoutUser($token = null) {
    $db = getDB();
    
    if (!$token) {
        startSecureSession();
        $token = $_SESSION['session_token'] ?? null;
    }
    
    if ($token) {
        $db->delete("DELETE FROM sessions WHERE id = ?", [$token]);
    }
    
    // Clear session
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_destroy();
    }
    
    return ['success' => true];
}

/**
 * Grant free account to a user
 */
function grantFreeAccount($email) {
    $db = getDB();
    
    $result = $db->update(
        "UPDATE users SET subscription_status = 'active', subscription_plan = 'free_granted', subscription_ends_at = NULL WHERE email = ?",
        [strtolower($email)]
    );
    
    return $result > 0;
}

/**
 * Authenticate request via token (alias for validateSession for API consistency)
 * Used by email-outreach.php and other API endpoints
 */
function authenticateRequest() {
    return validateSession();
}
