<?php
/**
 * Per-User Rate Limiting for BamLead
 * Limits: Free/Trial = 50/hour, Paid = 200/hour
 */

require_once __DIR__ . '/database.php';
require_once __DIR__ . '/functions.php';

/**
 * Rate limit configuration by subscription plan
 */
function getRateLimitConfig($user = null) {
    // Default for unauthenticated or free users
    $limits = [
        'free' => 50,
        'trial' => 50,
        'basic' => 200,
        'pro' => 200,
        'agency' => 200,
        'free_granted' => 200, // Owner-granted free accounts get paid limits
        'admin' => 500,
        'owner' => 1000,
    ];
    
    if (!$user) {
        return $limits['free'];
    }
    
    // Owners get highest limit
    if (!empty($user['is_owner'])) {
        return $limits['owner'];
    }
    
    // Admins get high limit
    if (!empty($user['role']) && $user['role'] === 'admin') {
        return $limits['admin'];
    }
    
    // Get limit based on subscription plan or status
    $plan = $user['subscription_plan'] ?? 'free';
    $status = $user['subscription_status'] ?? 'free';
    
    // If active subscription, use plan limit
    if ($status === 'active' && isset($limits[$plan])) {
        return $limits[$plan];
    }
    
    // Trial users get free tier limit
    if ($status === 'trial') {
        return $limits['trial'];
    }
    
    // Default to free limit
    return $limits['free'];
}

/**
 * Check if user has exceeded their rate limit
 * Returns: ['allowed' => bool, 'remaining' => int, 'reset_at' => timestamp]
 */
function checkRateLimit($user, $action = 'search') {
    $db = getDB();
    
    $userId = $user['id'] ?? $user['user_id'] ?? null;
    if (!$userId) {
        return ['allowed' => false, 'remaining' => 0, 'error' => 'Invalid user'];
    }
    
    $limit = getRateLimitConfig($user);
    $windowStart = date('Y-m-d H:i:s', strtotime('-1 hour'));
    
    // Count requests in the last hour
    $result = $db->fetchOne(
        "SELECT COUNT(*) as request_count FROM rate_limits 
         WHERE user_id = ? AND action = ? AND created_at > ?",
        [$userId, $action, $windowStart]
    );
    
    $requestCount = (int)($result['request_count'] ?? 0);
    $remaining = max(0, $limit - $requestCount);
    
    // Calculate when the oldest request in window expires
    $oldestRequest = $db->fetchOne(
        "SELECT created_at FROM rate_limits 
         WHERE user_id = ? AND action = ? AND created_at > ?
         ORDER BY created_at ASC LIMIT 1",
        [$userId, $action, $windowStart]
    );
    
    $resetAt = $oldestRequest 
        ? strtotime($oldestRequest['created_at']) + 3600 
        : time() + 3600;
    
    return [
        'allowed' => $requestCount < $limit,
        'remaining' => $remaining,
        'limit' => $limit,
        'used' => $requestCount,
        'reset_at' => $resetAt,
        'reset_in' => $resetAt - time()
    ];
}

/**
 * Record a rate-limited action
 */
function recordRateLimitAction($user, $action = 'search') {
    $db = getDB();
    
    $userId = $user['id'] ?? $user['user_id'] ?? null;
    if (!$userId) {
        return false;
    }
    
    try {
        $db->insert(
            "INSERT INTO rate_limits (user_id, action, ip_address) VALUES (?, ?, ?)",
            [$userId, $action, $_SERVER['REMOTE_ADDR'] ?? '']
        );
        return true;
    } catch (Exception $e) {
        // Log error but don't block the request
        error_log("Rate limit recording failed: " . $e->getMessage());
        return false;
    }
}

/**
 * Enforce rate limit - call this before processing a request
 * Sends 429 response if limit exceeded
 */
function enforceRateLimit($user, $action = 'search') {
    $rateLimit = checkRateLimit($user, $action);
    
    // Set rate limit headers
    header('X-RateLimit-Limit: ' . $rateLimit['limit']);
    header('X-RateLimit-Remaining: ' . $rateLimit['remaining']);
    header('X-RateLimit-Reset: ' . $rateLimit['reset_at']);
    
    if (!$rateLimit['allowed']) {
        $resetIn = max(1, $rateLimit['reset_in']);
        $minutes = ceil($resetIn / 60);
        
        header('Retry-After: ' . $resetIn);
        sendError(
            "Rate limit exceeded. You've used {$rateLimit['used']}/{$rateLimit['limit']} requests this hour. " .
            "Try again in {$minutes} minute(s). Upgrade your plan for higher limits.",
            429
        );
        exit;
    }
    
    // Record this action
    recordRateLimitAction($user, $action);
    
    return $rateLimit;
}

/**
 * Cleanup old rate limit records (call via cron)
 */
function cleanupRateLimits() {
    $db = getDB();
    
    // Delete records older than 2 hours
    $cutoff = date('Y-m-d H:i:s', strtotime('-2 hours'));
    $deleted = $db->delete(
        "DELETE FROM rate_limits WHERE created_at < ?",
        [$cutoff]
    );
    
    return $deleted;
}
