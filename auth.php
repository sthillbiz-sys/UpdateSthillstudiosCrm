<?php
/**
 * Website Analysis API Endpoint
 * Analyzes a single website for platform detection and issues
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/includes/functions.php';

header('Content-Type: application/json');
setCorsHeaders();
handlePreflight();

// Allow both GET and POST
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $url = isset($_GET['url']) ? trim($_GET['url']) : '';
} elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = getJsonInput();
    $url = isset($input['url']) ? trim($input['url']) : '';
} else {
    sendError('Method not allowed', 405);
}

if (empty($url)) {
    sendError('URL is required');
}

// Ensure URL has protocol
if (!preg_match('/^https?:\/\//', $url)) {
    $url = 'https://' . $url;
}

// Validate URL
if (!filter_var($url, FILTER_VALIDATE_URL)) {
    sendError('Invalid URL format');
}

try {
    $cacheKey = "analyze_website_" . md5($url);
    
    // Check cache
    $cached = getCache($cacheKey);
    if ($cached !== null) {
        sendJson([
            'success' => true,
            'data' => $cached,
            'cached' => true
        ]);
    }
    
    $analysis = analyzeWebsite($url);
    
    // Add extra details
    $analysis['url'] = $url;
    $analysis['analyzedAt'] = date('c');
    
    // Cache results
    setCache($cacheKey, $analysis);
    
    sendJson([
        'success' => true,
        'data' => $analysis
    ]);
} catch (Exception $e) {
    if (DEBUG_MODE) {
        sendError($e->getMessage(), 500);
    } else {
        sendError('An error occurred while analyzing the website', 500);
    }
}
