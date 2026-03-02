<?php
/**
 * Platform Search API Endpoint
 * Searches Google & Bing for businesses using specific website platforms
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/includes/functions.php';
require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/includes/ratelimit.php';

header('Content-Type: application/json');
setCorsHeaders();
handlePreflight();

// Only allow POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendError('Method not allowed', 405);
}

// Require authentication and enforce rate limit
$user = requireAuth();
enforceRateLimit($user, 'search');

// Get and validate input
$input = getJsonInput();
if (!$input) {
    sendError('Invalid JSON input');
}

$service = sanitizeInput($input['service'] ?? '');
$location = sanitizeInput($input['location'] ?? '');
$platforms = isset($input['platforms']) && is_array($input['platforms']) ? $input['platforms'] : [];

if (empty($service)) {
    sendError('Service type is required');
}

if (empty($location)) {
    sendError('Location is required');
}

if (empty($platforms)) {
    sendError('At least one platform must be selected');
}

// Sanitize platforms
$platforms = array_map(function($p) {
    return sanitizeInput($p, 50);
}, array_slice($platforms, 0, 20));

try {
    $cacheKey = "platform_search_{$service}_{$location}_" . implode(',', $platforms);
    
    // Check cache
    $cached = getCache($cacheKey);
    if ($cached !== null) {
        sendJson([
            'success' => true,
            'data' => $cached,
            'query' => [
                'service' => $service,
                'location' => $location,
                'platforms' => $platforms
            ],
            'cached' => true
        ]);
    }
    
    $results = searchPlatforms($service, $location, $platforms);
    
    // Cache results
    setCache($cacheKey, $results);
    
    sendJson([
        'success' => true,
        'data' => $results,
        'query' => [
            'service' => $service,
            'location' => $location,
            'platforms' => $platforms
        ]
    ]);
} catch (Exception $e) {
    if (DEBUG_MODE) {
        sendError($e->getMessage(), 500);
    } else {
        sendError('An error occurred while searching', 500);
    }
}

/**
 * Search for businesses using specific platforms
 */
function searchPlatforms($service, $location, $platforms) {
    // Build platform query modifiers
    $platformQueries = buildPlatformQueries($platforms);
    
    $allResults = [];
    
    // Search Google if API key is available
    if (!empty(GOOGLE_API_KEY) && !empty(GOOGLE_SEARCH_ENGINE_ID)) {
        $googleResults = searchGoogle($service, $location, $platformQueries);
        $allResults = array_merge($allResults, $googleResults);
    }
    
    // Search Bing if API key is available
    if (!empty(BING_API_KEY)) {
        $bingResults = searchBing($service, $location, $platformQueries);
        $allResults = array_merge($allResults, $bingResults);
    }
    
    // If no APIs configured, return mock data
    if (empty($allResults)) {
        return getMockPlatformResults($service, $location, $platforms);
    }
    
    // Deduplicate by URL
    $unique = [];
    $seen = [];
    foreach ($allResults as $result) {
        $domain = parse_url($result['url'], PHP_URL_HOST);
        if ($domain && !isset($seen[$domain])) {
            $seen[$domain] = true;
            $unique[] = $result;
        }
    }
    
    // Analyze websites
    return array_map(function($result) {
        $result['websiteAnalysis'] = analyzeWebsite($result['url']);
        return $result;
    }, array_slice($unique, 0, RESULTS_PER_PAGE));
}

/**
 * Build search query modifiers for platforms
 */
function buildPlatformQueries($platforms) {
    $modifiers = [];
    
    $platformIndicators = [
        'wordpress' => 'site:*.wordpress.com OR "powered by wordpress" OR "wp-content"',
        'wix' => 'site:*.wix.com OR site:*.wixsite.com OR "built with wix"',
        'weebly' => 'site:*.weebly.com OR "powered by weebly"',
        'godaddy' => '"godaddy website" OR site:*.godaddysites.com',
        'squarespace' => 'site:*.squarespace.com OR "powered by squarespace"',
        'joomla' => '"powered by joomla" OR "joomla!"',
        'drupal' => '"powered by drupal"',
        'webcom' => 'site:*.web.com',
        'jimdo' => 'site:*.jimdofree.com OR site:*.jimdo.com',
        'opencart' => '"powered by opencart"',
        'prestashop' => '"powered by prestashop"',
        'magento' => '"powered by magento"',
        'zencart' => '"powered by zen cart"',
        'oscommerce' => '"powered by oscommerce"',
        'customhtml' => 'inurl:".html" OR inurl:".htm"',
        'customphp' => 'inurl:".php"',
    ];
    
    foreach ($platforms as $platform) {
        $key = strtolower($platform);
        if (isset($platformIndicators[$key])) {
            $modifiers[] = $platformIndicators[$key];
        }
    }
    
    return $modifiers;
}

/**
 * Search Google Custom Search API
 */
function searchGoogle($service, $location, $platformQueries) {
    $results = [];
    
    // Build query
    $baseQuery = "$service $location";
    if (!empty($platformQueries)) {
        $baseQuery .= ' (' . implode(' OR ', array_slice($platformQueries, 0, 3)) . ')';
    }
    
    $query = urlencode($baseQuery);
    $url = "https://www.googleapis.com/customsearch/v1?" . http_build_query([
        'key' => GOOGLE_API_KEY,
        'cx' => GOOGLE_SEARCH_ENGINE_ID,
        'q' => $baseQuery,
        'num' => RESULTS_PER_PAGE
    ]);
    
    $response = curlRequest($url);
    
    if ($response['httpCode'] !== 200) {
        if (DEBUG_MODE) {
            throw new Exception('Google API error: ' . $response['httpCode']);
        }
        return $results;
    }
    
    $data = json_decode($response['response'], true);
    
    if (!isset($data['items'])) {
        return $results;
    }
    
    foreach ($data['items'] as $item) {
        $results[] = [
            'id' => generateId('goog_'),
            'name' => $item['title'] ?? 'Unknown Business',
            'url' => $item['link'] ?? '',
            'snippet' => $item['snippet'] ?? '',
            'displayLink' => $item['displayLink'] ?? '',
            'source' => 'google'
        ];
    }
    
    return $results;
}

/**
 * Search Bing Web Search API
 */
function searchBing($service, $location, $platformQueries) {
    $results = [];
    
    // Build query
    $baseQuery = "$service $location";
    if (!empty($platformQueries)) {
        $baseQuery .= ' (' . implode(' OR ', array_slice($platformQueries, 0, 3)) . ')';
    }
    
    $url = "https://api.bing.microsoft.com/v7.0/search?" . http_build_query([
        'q' => $baseQuery,
        'count' => RESULTS_PER_PAGE,
        'responseFilter' => 'Webpages'
    ]);
    
    $response = curlRequest($url, [
        CURLOPT_HTTPHEADER => [
            'Ocp-Apim-Subscription-Key: ' . BING_API_KEY
        ]
    ]);
    
    if ($response['httpCode'] !== 200) {
        if (DEBUG_MODE) {
            throw new Exception('Bing API error: ' . $response['httpCode']);
        }
        return $results;
    }
    
    $data = json_decode($response['response'], true);
    
    if (!isset($data['webPages']['value'])) {
        return $results;
    }
    
    foreach ($data['webPages']['value'] as $item) {
        $results[] = [
            'id' => generateId('bing_'),
            'name' => $item['name'] ?? 'Unknown Business',
            'url' => $item['url'] ?? '',
            'snippet' => $item['snippet'] ?? '',
            'displayLink' => parse_url($item['url'] ?? '', PHP_URL_HOST) ?: '',
            'source' => 'bing'
        ];
    }
    
    return $results;
}

/**
 * Get mock results for testing
 */
function getMockPlatformResults($service, $location, $platforms) {
    $businesses = [
        ['name' => "{$location} {$service} Experts", 'platform' => 'WordPress'],
        ['name' => "Best {$service} Co", 'platform' => 'Wix'],
        ['name' => "Pro {$service} Services", 'platform' => 'Weebly'],
        ['name' => "{$service} Masters LLC", 'platform' => 'GoDaddy'],
        ['name' => "Elite {$service} Group", 'platform' => 'Joomla'],
        ['name' => "Quality {$service} Inc", 'platform' => 'Custom PHP'],
        ['name' => "Premier {$service} Solutions", 'platform' => 'Squarespace'],
        ['name' => "{$location} {$service} Pros", 'platform' => 'WordPress'],
    ];
    
    $issues = [
        'Not mobile responsive',
        'Missing meta description',
        'Outdated jQuery version',
        'Large page size',
        'Missing alt tags',
        'Tables used for layout',
        'Missing favicon',
    ];
    
    $results = [];
    
    foreach ($businesses as $index => $biz) {
        $domain = strtolower(str_replace(' ', '', $biz['name'])) . '.com';
        $issueCount = rand(0, 4);
        $selectedIssues = array_slice($issues, 0, $issueCount);
        
        $results[] = [
            'id' => generateId('mock_'),
            'name' => $biz['name'],
            'url' => "https://{$domain}",
            'snippet' => "Professional {$service} services in {$location}. Quality work, competitive prices.",
            'displayLink' => $domain,
            'source' => 'mock',
            'phone' => sprintf('(%03d) %03d-%04d', rand(200, 999), rand(100, 999), rand(1000, 9999)),
            'address' => sprintf('%d Main St, %s', rand(100, 9999), $location),
            'websiteAnalysis' => [
                'hasWebsite' => true,
                'platform' => $biz['platform'],
                'needsUpgrade' => $issueCount >= 2 || in_array($biz['platform'], ['WordPress', 'Wix', 'Weebly']),
                'issues' => $selectedIssues,
                'mobileScore' => rand(35, 95),
                'loadTime' => rand(800, 4500)
            ]
        ];
    }
    
    return $results;
}
