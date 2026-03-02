<?php
/**
 * Shared helper functions for BamLead API
 */

require_once __DIR__ . '/../config.php';

/**
 * Set CORS headers for API responses
 */
function setCorsHeaders() {
    $origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
    
    // Only allow whitelisted origins - never use wildcard in production
    if (defined('ALLOWED_ORIGINS') && in_array($origin, ALLOWED_ORIGINS)) {
        header("Access-Control-Allow-Origin: $origin");
        header('Access-Control-Allow-Credentials: true');
    } elseif (defined('DEBUG_MODE') && DEBUG_MODE) {
        // In dev mode, allow localhost origins
        if (preg_match('/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/', $origin)) {
            header("Access-Control-Allow-Origin: $origin");
            header('Access-Control-Allow-Credentials: true');
        }
    }
    // If origin not allowed, don't set CORS header - browser will block
    
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
    header('Access-Control-Max-Age: 86400');
    
    // Security headers
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('X-XSS-Protection: 1; mode=block');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    
    // CSP for API responses (JSON)
    header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");
}

/**
 * Handle preflight OPTIONS request
 */
function handlePreflight() {
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(200);
        exit();
    }
}

/**
 * Send JSON response
 */
function sendJson($data, $statusCode = 200) {
    http_response_code($statusCode);
    header('Content-Type: application/json');
    echo json_encode($data);
    exit();
}

/**
 * Send error response
 */
function sendError($message, $statusCode = 400) {
    sendJson(['success' => false, 'error' => $message], $statusCode);
}

/**
 * Get JSON input from request body
 */
function getJsonInput() {
    $input = json_decode(file_get_contents('php://input'), true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        return null;
    }
    return $input;
}

/**
 * Sanitize string input
 */
function sanitizeInput($input, $maxLength = 100) {
    if (!is_string($input)) {
        return '';
    }
    $input = trim($input);
    $input = htmlspecialchars($input, ENT_QUOTES, 'UTF-8');
    if (strlen($input) > $maxLength) {
        $input = substr($input, 0, $maxLength);
    }
    return $input;
}

/**
 * Make a cURL request
 */
function curlRequest($url, $options = []) {
    $ch = curl_init();
    
    $defaultOptions = [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_USERAGENT => 'BamLead/1.0 (Website Analyzer)',
    ];
    
    curl_setopt_array($ch, $defaultOptions + $options);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    
    curl_close($ch);
    
    return [
        'response' => $response,
        'httpCode' => $httpCode,
        'error' => $error
    ];
}

/**
 * Get cached result if available
 */
function getCache($key) {
    if (!defined('ENABLE_CACHE') || !ENABLE_CACHE) {
        return null;
    }
    
    // Validate cache key to prevent directory traversal
    if (!preg_match('/^[a-zA-Z0-9_\-]+$/', $key)) {
        return null;
    }
    
    $cacheFile = CACHE_DIR . '/' . md5($key) . '.cache';
    
    if (!file_exists($cacheFile)) {
        return null;
    }
    
    // Use JSON instead of unserialize to prevent object injection
    $contents = file_get_contents($cacheFile);
    $data = json_decode($contents, true);
    
    if (!$data || !isset($data['expires']) || $data['expires'] < time()) {
        @unlink($cacheFile);
        return null;
    }
    
    return $data['value'];
}

/**
 * Set cache value
 */
function setCache($key, $value, $ttl = null) {
    if (!defined('ENABLE_CACHE') || !ENABLE_CACHE) {
        return false;
    }
    
    // Validate cache key
    if (!preg_match('/^[a-zA-Z0-9_\-]+$/', $key)) {
        return false;
    }
    
    if (!is_dir(CACHE_DIR)) {
        @mkdir(CACHE_DIR, 0755, true);
    }
    
    $ttl = $ttl ?? CACHE_DURATION;
    $cacheFile = CACHE_DIR . '/' . md5($key) . '.cache';
    
    $data = [
        'expires' => time() + $ttl,
        'value' => $value
    ];
    
    // Use JSON instead of serialize for security
    return file_put_contents($cacheFile, json_encode($data)) !== false;
}

/**
 * Detect website platform from HTML
 */
function detectPlatform($html) {
    $html = strtolower($html);
    
    $platforms = [
        'WordPress' => ['wp-content', 'wordpress', 'wp-includes'],
        'Wix' => ['wix.com', 'wixsite.com', 'static.wixstatic.com'],
        'Squarespace' => ['squarespace', 'sqsp.net', 'static1.squarespace.com'],
        'Shopify' => ['shopify', 'cdn.shopify.com', 'myshopify.com'],
        'Webflow' => ['webflow', 'assets.website-files.com'],
        'GoDaddy' => ['godaddy', 'secureserver.net', 'godaddysites.com'],
        'Weebly' => ['weebly', 'weeblycloud.com'],
        'Joomla' => ['joomla', '/components/com_', '/modules/mod_'],
        'Drupal' => ['drupal', '/sites/default/files', 'drupal.settings'],
        'Magento' => ['magento', 'mage/', 'varien'],
        'PrestaShop' => ['prestashop', '/themes/default/', 'presta'],
        'OpenCart' => ['opencart', '/catalog/view/', 'route='],
        'Zen Cart' => ['zen cart', 'zen-cart', 'zencart'],
        'osCommerce' => ['oscommerce', 'osc_session'],
        'Jimdo' => ['jimdo', 'jimdofree', 'jimcdn.com'],
        'Web.com' => ['web.com', 'website-builder'],
        'BigCommerce' => ['bigcommerce', 'bigcommercecdn'],
        'Duda' => ['duda', 'dudaone', 'duda.co'],
        'HubSpot' => ['hubspot', 'hs-scripts', 'hscta'],
    ];
    
    foreach ($platforms as $name => $indicators) {
        foreach ($indicators as $indicator) {
            if (strpos($html, $indicator) !== false) {
                return $name;
            }
        }
    }
    
    // Check for basic indicators
    if (strpos($html, '<!doctype html>') !== false || strpos($html, '<!DOCTYPE html>') !== false) {
        // Check for any CMS indicators
        if (preg_match('/content="[^"]*generator[^"]*"/i', $html)) {
            return 'Custom CMS';
        }
    }
    
    // Check for very old sites
    if (strpos($html, '<table') !== false && strpos($html, 'width=') !== false) {
        return 'Custom HTML (Legacy)';
    }
    
    if (strpos($html, '.php') !== false) {
        return 'Custom PHP';
    }
    
    return 'Custom/Unknown';
}

/**
 * Detect website issues
 */
function detectIssues($html) {
    $issues = [];
    $htmlLower = strtolower($html);
    
    // Mobile responsiveness
    if (strpos($htmlLower, 'viewport') === false) {
        $issues[] = 'Not mobile responsive';
    }
    
    // Page size
    $pageSize = strlen($html);
    if ($pageSize > 500000) {
        $issues[] = 'Large page size (slow loading)';
    }
    
    // HTML5 doctype
    if (strpos($htmlLower, '<!doctype html>') === false) {
        $issues[] = 'Outdated HTML structure';
    }
    
    // Meta description
    if (strpos($htmlLower, 'meta name="description"') === false && 
        strpos($htmlLower, "meta name='description'") === false) {
        $issues[] = 'Missing meta description';
    }
    
    // Title tag
    if (strpos($htmlLower, '<title>') === false || strpos($htmlLower, '<title></title>') !== false) {
        $issues[] = 'Missing or empty title tag';
    }
    
    // Old jQuery
    if (preg_match('/jquery[.-]?1\.[0-9]/', $htmlLower) || 
        preg_match('/jquery[.-]?2\.[0-2]/', $htmlLower)) {
        $issues[] = 'Outdated jQuery version';
    }
    
    // Flash content
    if (strpos($htmlLower, 'swfobject') !== false || strpos($htmlLower, '.swf') !== false) {
        $issues[] = 'Uses Flash (deprecated)';
    }
    
    // Missing alt tags
    if (preg_match('/<img[^>]+(?!alt)[^>]*>/i', $html)) {
        $issues[] = 'Missing alt tags on images';
    }
    
    // Inline styles (indicator of old practices)
    $inlineStyleCount = substr_count($htmlLower, 'style="');
    if ($inlineStyleCount > 20) {
        $issues[] = 'Excessive inline styles';
    }
    
    // Tables for layout
    $tableCount = substr_count($htmlLower, '<table');
    if ($tableCount > 5 && strpos($htmlLower, 'width=') !== false) {
        $issues[] = 'Tables used for layout';
    }
    
    // HTTP resources on HTTPS
    if (preg_match('/src=["\']http:\/\//i', $html)) {
        $issues[] = 'Mixed content (HTTP on HTTPS)';
    }
    
    // Missing Open Graph tags
    if (strpos($htmlLower, 'og:') === false) {
        $issues[] = 'Missing social media meta tags';
    }
    
    // Missing favicon
    if (strpos($htmlLower, 'favicon') === false && strpos($htmlLower, 'icon') === false) {
        $issues[] = 'Missing favicon';
    }
    
    return $issues;
}

/**
 * Analyze a website and return analysis data
 */
function analyzeWebsite($url) {
    if (empty($url)) {
        return [
            'hasWebsite' => false,
            'platform' => null,
            'needsUpgrade' => true,
            'issues' => ['No website found'],
            'mobileScore' => null,
            'loadTime' => null
        ];
    }
    
    // Ensure URL has protocol
    if (!preg_match('/^https?:\/\//', $url)) {
        $url = 'https://' . $url;
    }
    
    $startTime = microtime(true);
    
    $result = curlRequest($url, [
        CURLOPT_TIMEOUT => WEBSITE_TIMEOUT,
        CURLOPT_SSL_VERIFYPEER => false,
    ]);
    
    $loadTime = round((microtime(true) - $startTime) * 1000); // ms
    
    $analysis = [
        'hasWebsite' => $result['httpCode'] === 200,
        'platform' => null,
        'needsUpgrade' => false,
        'issues' => [],
        'mobileScore' => null,
        'loadTime' => $loadTime
    ];
    
    if ($result['httpCode'] !== 200 || empty($result['response'])) {
        $analysis['hasWebsite'] = false;
        $analysis['needsUpgrade'] = true;
        $analysis['issues'][] = 'Website not accessible';
        return $analysis;
    }
    
    $html = $result['response'];
    
    // Detect platform
    $analysis['platform'] = detectPlatform($html);
    
    // Detect issues
    $analysis['issues'] = detectIssues($html);
    
    // Calculate mobile score (simplified)
    $mobileScore = 100;
    if (strpos(strtolower($html), 'viewport') === false) {
        $mobileScore -= 40;
    }
    if (strlen($html) > 300000) {
        $mobileScore -= 20;
    }
    if ($loadTime > 3000) {
        $mobileScore -= 20;
    }
    foreach ($analysis['issues'] as $issue) {
        $mobileScore -= 5;
    }
    $analysis['mobileScore'] = max(0, min(100, $mobileScore));
    
    // Determine if needs upgrade
    $lowPriorityPlatforms = ['WordPress', 'Wix', 'Weebly', 'GoDaddy', 'Joomla', 'Drupal'];
    $analysis['needsUpgrade'] = 
        count($analysis['issues']) >= 2 ||
        in_array($analysis['platform'], $lowPriorityPlatforms) ||
        $analysis['mobileScore'] < 60 ||
        $loadTime > 4000;
    
    return $analysis;
}

/**
 * Extract phone numbers from text
 */
function extractPhoneNumbers($text) {
    $phones = [];
    
    // US phone patterns
    $patterns = [
        '/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/',
        '/\d{3}[-.\s]\d{3}[-.\s]\d{4}/',
        '/1[-.\s]?\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/',
    ];
    
    foreach ($patterns as $pattern) {
        if (preg_match_all($pattern, $text, $matches)) {
            $phones = array_merge($phones, $matches[0]);
        }
    }
    
    return array_unique($phones);
}

/**
 * Extract email addresses from text
 */
function extractEmails($text) {
    $emails = [];
    
    if (preg_match_all('/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/', $text, $matches)) {
        $emails = array_unique($matches[0]);
    }
    
    return $emails;
}

/**
 * Generate a unique ID
 */
function generateId($prefix = '') {
    return $prefix . uniqid() . '_' . bin2hex(random_bytes(4));
}
