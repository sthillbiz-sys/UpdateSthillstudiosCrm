<?php
/**
 * Admin API Endpoint
 * Handles user management, granting free accounts, etc.
 */

require_once __DIR__ . '/includes/functions.php';
require_once __DIR__ . '/includes/auth.php';

// Handle CORS
setCorsHeaders();
handlePreflight();

// Require admin access for all endpoints
$currentUser = requireAdmin();

// Get the action from query parameter
$action = $_GET['action'] ?? '';

switch ($action) {
    case 'users':
        handleGetUsers();
        break;
    case 'user':
        handleUserAction();
        break;
    case 'grant-free':
        handleGrantFreeAccount();
        break;
    case 'stats':
        handleGetStats();
        break;
    default:
        sendError('Invalid action', 400);
}

/**
 * Get all users (paginated)
 */
function handleGetUsers() {
    $db = getDB();
    
    $page = max(1, intval($_GET['page'] ?? 1));
    $limit = min(100, max(10, intval($_GET['limit'] ?? 20)));
    $offset = ($page - 1) * $limit;
    
    $search = sanitizeInput($_GET['search'] ?? '', 100);
    $role = sanitizeInput($_GET['role'] ?? '', 20);
    $status = sanitizeInput($_GET['status'] ?? '', 20);
    
    $where = [];
    $params = [];
    
    if ($search) {
        $where[] = "(email LIKE ? OR name LIKE ?)";
        $params[] = "%$search%";
        $params[] = "%$search%";
    }
    
    if ($role) {
        $where[] = "role = ?";
        $params[] = $role;
    }
    
    if ($status) {
        $where[] = "subscription_status = ?";
        $params[] = $status;
    }
    
    $whereClause = $where ? 'WHERE ' . implode(' AND ', $where) : '';
    
    // Get total count
    $countParams = $params;
    $total = $db->fetchOne("SELECT COUNT(*) as count FROM users $whereClause", $countParams)['count'];
    
    // Get users
    $params[] = $limit;
    $params[] = $offset;
    
    $users = $db->fetchAll(
        "SELECT id, email, name, role, subscription_status, subscription_plan, 
                trial_ends_at, subscription_ends_at, is_owner, created_at, last_login_at 
         FROM users $whereClause 
         ORDER BY created_at DESC 
         LIMIT ? OFFSET ?",
        $params
    );
    
    sendJson([
        'success' => true,
        'users' => $users,
        'pagination' => [
            'page' => $page,
            'limit' => $limit,
            'total' => $total,
            'pages' => ceil($total / $limit)
        ]
    ]);
}

/**
 * Handle single user actions (update, delete)
 */
function handleUserAction() {
    $db = getDB();
    $userId = intval($_GET['id'] ?? 0);
    
    if (!$userId) {
        sendError('User ID required');
    }
    
    $user = $db->fetchOne("SELECT * FROM users WHERE id = ?", [$userId]);
    
    if (!$user) {
        sendError('User not found', 404);
    }
    
    switch ($_SERVER['REQUEST_METHOD']) {
        case 'GET':
            unset($user['password_hash']);
            sendJson(['success' => true, 'user' => $user]);
            break;
            
        case 'PUT':
        case 'PATCH':
            $input = getJsonInput();
            $updates = [];
            $params = [];
            
            $allowedFields = ['name', 'role', 'subscription_status', 'subscription_plan', 'subscription_ends_at'];
            
            foreach ($allowedFields as $field) {
                if (isset($input[$field])) {
                    $updates[] = "$field = ?";
                    $params[] = $input[$field];
                }
            }
            
            if (empty($updates)) {
                sendError('No valid fields to update');
            }
            
            $params[] = $userId;
            $db->update(
                "UPDATE users SET " . implode(', ', $updates) . " WHERE id = ?",
                $params
            );
            
            sendJson(['success' => true, 'message' => 'User updated']);
            break;
            
        case 'DELETE':
            // Cannot delete owner
            if ($user['is_owner']) {
                sendError('Cannot delete owner account', 403);
            }
            
            $db->delete("DELETE FROM users WHERE id = ?", [$userId]);
            sendJson(['success' => true, 'message' => 'User deleted']);
            break;
            
        default:
            sendError('Method not allowed', 405);
    }
}

/**
 * Grant free account to a user by email
 */
function handleGrantFreeAccount() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        sendError('Method not allowed', 405);
    }
    
    $input = getJsonInput();
    $email = sanitizeInput($input['email'] ?? '', 255);
    
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        sendError('Invalid email address');
    }
    
    $db = getDB();
    
    // Check if user exists
    $user = $db->fetchOne("SELECT id FROM users WHERE email = ?", [strtolower($email)]);
    
    if (!$user) {
        sendError('User not found', 404);
    }
    
    // Grant free account
    $success = grantFreeAccount($email);
    
    if ($success) {
        sendJson([
            'success' => true,
            'message' => "Free account granted to $email"
        ]);
    } else {
        sendError('Failed to grant free account');
    }
}

/**
 * Get dashboard stats
 */
function handleGetStats() {
    $db = getDB();
    
    $stats = [
        'total_users' => $db->fetchOne("SELECT COUNT(*) as count FROM users")['count'],
        'active_subscriptions' => $db->fetchOne(
            "SELECT COUNT(*) as count FROM users WHERE subscription_status = 'active'"
        )['count'],
        'trial_users' => $db->fetchOne(
            "SELECT COUNT(*) as count FROM users WHERE subscription_status = 'trial'"
        )['count'],
        'total_leads' => $db->fetchOne("SELECT COUNT(*) as count FROM saved_leads")['count'],
        'total_searches' => $db->fetchOne("SELECT COUNT(*) as count FROM search_history")['count'],
        'users_today' => $db->fetchOne(
            "SELECT COUNT(*) as count FROM users WHERE DATE(created_at) = CURDATE()"
        )['count'],
        'searches_today' => $db->fetchOne(
            "SELECT COUNT(*) as count FROM search_history WHERE DATE(created_at) = CURDATE()"
        )['count'],
    ];
    
    sendJson([
        'success' => true,
        'stats' => $stats
    ]);
}
