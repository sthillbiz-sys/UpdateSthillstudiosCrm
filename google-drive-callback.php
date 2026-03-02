<?php
/**
 * GMB Search API Endpoint
 * Searches for businesses using SerpAPI Google Maps
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
$limit = intval($input['limit'] ?? 100); // Default 100, max 2000

// Validate limit (min 20, max 2000)
$limit = max(20, min(2000, $limit));

if (empty($service)) {
    sendError('Service type is required');
}

if (empty($location)) {
    sendError('Location is required');
}

try {
    $cacheKey = "gmb_search_{$service}_{$location}_{$limit}";
    
    // Check cache
    $cached = getCache($cacheKey);
    if ($cached !== null) {
        sendJson([
            'success' => true,
            'data' => $cached,
            'query' => [
                'service' => $service,
                'location' => $location,
                'limit' => $limit
            ],
            'cached' => true
        ]);
    }
    
    $results = searchGMBListings($service, $location, $limit);
    
    // Cache results
    setCache($cacheKey, $results);
    
    sendJson([
        'success' => true,
        'data' => $results,
        'query' => [
            'service' => $service,
            'location' => $location,
            'limit' => $limit
        ],
        'totalResults' => count($results)
    ]);
} catch (Exception $e) {
    if (defined('DEBUG_MODE') && DEBUG_MODE) {
        sendError($e->getMessage(), 500);
    } else {
        sendError('An error occurred while searching', 500);
    }
}

/**
 * Search for GMB listings using SerpAPI Google Maps
 * Fetches multiple pages for comprehensive results up to the specified limit
 */
function searchGMBListings($service, $location, $limit = 100) {
    $apiKey = defined('SERPAPI_KEY') ? SERPAPI_KEY : '';
    
    if (empty($apiKey)) {
        // Return expanded mock data if API not configured - up to 500 for testing
        return getMockResults($service, $location, min($limit, 500));
    }
    
    $query = "$service in $location";
    $allResults = [];
    $resultsPerPage = 20;
    $maxPages = ceil($limit / $resultsPerPage); // Calculate pages needed for limit
    $maxPages = min($maxPages, 100); // Cap at 100 pages (2000 results max)
    
    for ($page = 0; $page < $maxPages; $page++) {
        // Stop if we have enough results
        if (count($allResults) >= $limit) {
            break;
        }
        
        $params = [
            'engine' => 'google_maps',
            'q' => $query,
            'type' => 'search',
            'api_key' => $apiKey,
            'hl' => 'en',
            'num' => $resultsPerPage,
        ];
        
        // Add pagination offset for subsequent pages
        if ($page > 0) {
            $params['start'] = $page * $resultsPerPage;
        }
        
        $url = "https://serpapi.com/search.json?" . http_build_query($params);
        
        $response = curlRequest($url);
        
        if ($response['httpCode'] !== 200) {
            // If first page fails, throw error; otherwise just stop pagination
            if ($page === 0) {
                throw new Exception('Failed to fetch search results from SerpAPI');
            }
            break;
        }
        
        $data = json_decode($response['response'], true);
        
        if (!isset($data['local_results']) || empty($data['local_results'])) {
            break; // No more results
        }
        
        foreach ($data['local_results'] as $item) {
            // Stop if we've reached the limit
            if (count($allResults) >= $limit) {
                break;
            }
            
            $websiteUrl = $item['website'] ?? '';
            
            $business = [
                'id' => generateId('gmb_'),
                'name' => $item['title'] ?? 'Unknown Business',
                'url' => $websiteUrl,
                'snippet' => $item['description'] ?? ($item['type'] ?? ''),
                'displayLink' => parse_url($websiteUrl, PHP_URL_HOST) ?? '',
                'address' => $item['address'] ?? '',
                'phone' => $item['phone'] ?? '',
                'rating' => $item['rating'] ?? null,
                'reviews' => $item['reviews'] ?? null,
                'placeId' => $item['place_id'] ?? '',
            ];
            
            // Analyze website if exists
            if (!empty($websiteUrl)) {
                $business['websiteAnalysis'] = analyzeWebsite($websiteUrl);
            } else {
                $business['websiteAnalysis'] = [
                    'hasWebsite' => false,
                    'platform' => null,
                    'needsUpgrade' => true,
                    'issues' => ['No website found']
                ];
            }
            
            $allResults[] = $business;
        }
        
        // Check if there are more pages
        if (!isset($data['serpapi_pagination']['next'])) {
            break;
        }
        
        // Small delay to avoid rate limiting
        usleep(200000); // 200ms delay between requests
    }
    
    return $allResults;
}

/**
 * Return mock results when API is not configured
 * Expanded to support up to 500 for testing UI
 */
function getMockResults($service, $location, $count = 100) {
    $prefixes = ['Best', 'Elite', 'Premier', 'Top', 'Pro', 'Expert', 'Quality', 'Reliable', 'Trusted', 'Certified', 
                 'Supreme', 'Master', 'Prime', 'First Class', 'Superior', 'Advanced', 'Professional', 'Ultimate', 
                 'Royal', 'Precision', 'Dynamic', 'Swift', 'Legacy', 'Titan', 'Apex', 'Alpha', 'Omega', 'Delta',
                 'Phoenix', 'Eagle', 'Summit', 'Pinnacle', 'Crown', 'Diamond', 'Platinum', 'Golden', 'Silver',
                 'Metro', 'Urban', 'City', 'Local', 'Regional', 'National', 'Express', 'Rapid', 'Quick', 'Fast'];
    $suffixes = ['Services', 'Solutions', 'Pros', 'Group', 'Co', 'Inc', 'LLC', 'Experts', 'Team', 'Masters'];
    $platforms = ['WordPress', 'Wix', 'Squarespace', 'GoDaddy', 'Weebly', 'Custom/Unknown', null, 'Joomla', 'Shopify'];
    $issues = [
        'Not mobile responsive',
        'Missing meta description', 
        'Outdated jQuery version',
        'Large page size (slow loading)',
        'Missing alt tags on images',
        'No SSL certificate',
        'Slow server response',
        'Tables used for layout'
    ];
    
    $results = [];
    
    for ($i = 0; $i < $count; $i++) {
        $prefix = $prefixes[$i % count($prefixes)];
        $suffix = $suffixes[$i % count($suffixes)];
        $platform = $platforms[array_rand($platforms)];
        $hasWebsite = rand(0, 100) > 15; // 85% have websites
        $issueCount = rand(0, 4);
        $selectedIssues = $hasWebsite ? array_slice($issues, 0, $issueCount) : ['No website found'];
        
        $results[] = [
            'id' => 'mock_' . ($i + 1) . '_' . time(),
            'name' => "$prefix $service $suffix",
            'url' => $hasWebsite ? 'https://example-' . strtolower($prefix) . '-' . ($i + 1) . '.com' : '',
            'snippet' => "Professional $service services in $location. Quality work, competitive pricing.",
            'displayLink' => $hasWebsite ? 'example-' . strtolower($prefix) . '-' . ($i + 1) . '.com' : '',
            'address' => (1000 + $i * 10) . " Main St, $location",
            'phone' => '(555) ' . rand(100, 999) . '-' . rand(1000, 9999),
            'rating' => round(rand(30, 50) / 10, 1),
            'reviews' => rand(5, 250),
            'websiteAnalysis' => [
                'hasWebsite' => $hasWebsite,
                'platform' => $hasWebsite ? $platform : null,
                'needsUpgrade' => !$hasWebsite || $issueCount >= 2,
                'issues' => $selectedIssues,
                'mobileScore' => $hasWebsite ? rand(35, 95) : null
            ]
        ];
    }
    
    return $results;
}
