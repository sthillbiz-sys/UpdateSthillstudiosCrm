<?php
/**
 * AI Lead Analysis & Grouping API Endpoint
 * Intelligently categorizes leads based on website analysis
 * for optimized email marketing campaigns
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

// Require authentication
$user = requireAuth();

// Get and validate input
$input = getJsonInput();
if (!$input) {
    sendError('Invalid JSON input');
}

$leads = $input['leads'] ?? [];
if (empty($leads)) {
    sendError('No leads provided');
}

try {
    $groupedLeads = analyzeAndGroupLeads($leads);
    
    sendJson([
        'success' => true,
        'data' => $groupedLeads,
        'summary' => generateLeadSummary($groupedLeads),
        'emailStrategies' => generateEmailStrategies($groupedLeads)
    ]);
} catch (Exception $e) {
    if (defined('DEBUG_MODE') && DEBUG_MODE) {
        sendError($e->getMessage(), 500);
    } else {
        sendError('An error occurred while analyzing leads', 500);
    }
}

/**
 * Main function to analyze and group leads intelligently
 */
function analyzeAndGroupLeads($leads) {
    $groups = [
        'no_website' => [
            'label' => 'No Website',
            'description' => 'Businesses without any online presence - highest opportunity',
            'priority' => 1,
            'emailAngle' => 'Build their first website',
            'urgency' => 'high',
            'leads' => []
        ],
        'broken_website' => [
            'label' => 'Website Broken/Down',
            'description' => 'Websites not loading or returning errors',
            'priority' => 2,
            'emailAngle' => 'Emergency website rescue',
            'urgency' => 'critical',
            'leads' => []
        ],
        'not_mobile_friendly' => [
            'label' => 'Not Mobile Friendly',
            'description' => 'Missing mobile optimization - losing 60%+ of traffic',
            'priority' => 3,
            'emailAngle' => 'Mobile customers are leaving',
            'urgency' => 'high',
            'leads' => []
        ],
        'outdated_technology' => [
            'label' => 'Outdated Technology',
            'description' => 'Using deprecated tech (Flash, old jQuery, legacy platforms)',
            'priority' => 4,
            'emailAngle' => 'Security and performance risks',
            'urgency' => 'medium',
            'leads' => []
        ],
        'poor_seo' => [
            'label' => 'Poor SEO Setup',
            'description' => 'Missing meta tags, titles, or social integration',
            'priority' => 5,
            'emailAngle' => 'Invisible to Google searches',
            'urgency' => 'medium',
            'leads' => []
        ],
        'slow_loading' => [
            'label' => 'Slow Loading',
            'description' => 'Page load time > 3 seconds - losing customers',
            'priority' => 6,
            'emailAngle' => 'Speed equals money',
            'urgency' => 'medium',
            'leads' => []
        ],
        'diy_platform' => [
            'label' => 'DIY Platform Limits',
            'description' => 'Using Wix, Weebly, GoDaddy - limited growth potential',
            'priority' => 7,
            'emailAngle' => 'Upgrade to professional solution',
            'urgency' => 'low',
            'leads' => []
        ],
        'needs_refresh' => [
            'label' => 'Needs Refresh',
            'description' => 'Multiple minor issues adding up',
            'priority' => 8,
            'emailAngle' => 'Modern redesign opportunity',
            'urgency' => 'low',
            'leads' => []
        ],
        'good_website' => [
            'label' => 'Website Looks Good',
            'description' => 'No major issues detected - consider other services',
            'priority' => 9,
            'emailAngle' => 'Maintenance or marketing services',
            'urgency' => 'nurture',
            'leads' => []
        ]
    ];
    
    foreach ($leads as $lead) {
        $analysis = $lead['websiteAnalysis'] ?? null;
        $enrichedLead = enrichLeadWithInsights($lead, $analysis);
        
        // Determine primary group
        $groupKey = determineLeadGroup($enrichedLead, $analysis);
        $groups[$groupKey]['leads'][] = $enrichedLead;
    }
    
    // Remove empty groups and sort by priority
    $groups = array_filter($groups, function($group) {
        return !empty($group['leads']);
    });
    
    // Re-index and sort
    uasort($groups, function($a, $b) {
        return $a['priority'] - $b['priority'];
    });
    
    return $groups;
}

/**
 * Determine which group a lead belongs to based on analysis
 */
function determineLeadGroup($lead, $analysis) {
    // No website at all
    if (!$analysis || !($analysis['hasWebsite'] ?? false)) {
        return 'no_website';
    }
    
    $issues = $analysis['issues'] ?? [];
    $platform = $analysis['platform'] ?? '';
    $mobileScore = $analysis['mobileScore'] ?? 100;
    $loadTime = $analysis['loadTime'] ?? 0;
    
    // Website broken/not accessible
    if (in_array('Website not accessible', $issues)) {
        return 'broken_website';
    }
    
    // Not mobile friendly - critical issue
    if (in_array('Not mobile responsive', $issues) || $mobileScore < 50) {
        return 'not_mobile_friendly';
    }
    
    // Outdated technology
    $outdatedIndicators = ['Uses Flash (deprecated)', 'Outdated jQuery version', 'Outdated HTML structure', 'Tables used for layout'];
    foreach ($outdatedIndicators as $indicator) {
        if (in_array($indicator, $issues)) {
            return 'outdated_technology';
        }
    }
    
    // Poor SEO
    $seoIssues = ['Missing meta description', 'Missing or empty title tag', 'Missing social media meta tags', 'Missing alt tags on images'];
    $seoIssueCount = 0;
    foreach ($seoIssues as $seoIssue) {
        if (in_array($seoIssue, $issues)) {
            $seoIssueCount++;
        }
    }
    if ($seoIssueCount >= 2) {
        return 'poor_seo';
    }
    
    // Slow loading
    if ($loadTime > 3000 || in_array('Large page size (slow loading)', $issues)) {
        return 'slow_loading';
    }
    
    // DIY platforms with limitations
    $diyPlatforms = ['Wix', 'Weebly', 'GoDaddy', 'Jimdo', 'Web.com'];
    if (in_array($platform, $diyPlatforms)) {
        return 'diy_platform';
    }
    
    // Multiple minor issues
    if (count($issues) >= 2) {
        return 'needs_refresh';
    }
    
    // Website seems fine
    return 'good_website';
}

/**
 * Enrich lead with AI insights for email marketing
 */
function enrichLeadWithInsights($lead, $analysis) {
    $lead['aiInsights'] = [];
    $lead['conversionProbability'] = 'medium';
    $lead['recommendedApproach'] = '';
    $lead['painPoints'] = [];
    $lead['talkingPoints'] = [];
    
    if (!$analysis || !($analysis['hasWebsite'] ?? false)) {
        $lead['aiInsights'][] = 'No online presence - missing 87% of customers who search online';
        $lead['aiInsights'][] = 'Competitors with websites are capturing their potential customers';
        $lead['conversionProbability'] = 'high';
        $lead['recommendedApproach'] = 'Offer starter package with quick turnaround';
        $lead['painPoints'][] = 'Invisible to online searches';
        $lead['painPoints'][] = 'Losing to competitors with websites';
        $lead['talkingPoints'][] = 'How do customers find you right now?';
        $lead['talkingPoints'][] = 'Have you noticed competitors getting more business?';
        return $lead;
    }
    
    $issues = $analysis['issues'] ?? [];
    $platform = $analysis['platform'] ?? '';
    $mobileScore = $analysis['mobileScore'] ?? 100;
    $loadTime = $analysis['loadTime'] ?? 0;
    
    // Mobile issues
    if (in_array('Not mobile responsive', $issues) || $mobileScore < 60) {
        $lead['aiInsights'][] = 'Over 60% of their potential customers are on mobile devices';
        $lead['aiInsights'][] = 'Google penalizes non-mobile-friendly sites in search rankings';
        $lead['painPoints'][] = 'Losing mobile customers';
        $lead['talkingPoints'][] = 'Have you tried viewing your site on a phone?';
        $lead['conversionProbability'] = 'high';
    }
    
    // Speed issues
    if ($loadTime > 3000) {
        $loadSeconds = round($loadTime / 1000, 1);
        $lead['aiInsights'][] = "Website takes {$loadSeconds}s to load - 53% of visitors leave after 3 seconds";
        $lead['painPoints'][] = 'Slow website losing customers';
        $lead['talkingPoints'][] = 'Do you notice customers complaining about your site?';
    }
    
    // SEO issues
    if (in_array('Missing meta description', $issues) || in_array('Missing or empty title tag', $issues)) {
        $lead['aiInsights'][] = 'Missing basic SEO - invisible in Google searches';
        $lead['painPoints'][] = 'Not appearing in search results';
        $lead['talkingPoints'][] = 'When you Google your business, where do you rank?';
    }
    
    // Outdated tech
    if (in_array('Uses Flash (deprecated)', $issues) || in_array('Outdated jQuery version', $issues)) {
        $lead['aiInsights'][] = 'Using deprecated technology - security vulnerabilities';
        $lead['painPoints'][] = 'Security risks';
        $lead['conversionProbability'] = 'high';
    }
    
    // DIY platform
    $diyPlatforms = ['Wix', 'Weebly', 'GoDaddy', 'Jimdo'];
    if (in_array($platform, $diyPlatforms)) {
        $lead['aiInsights'][] = "Using $platform - limited customization and SEO capabilities";
        $lead['painPoints'][] = 'Platform limitations hindering growth';
        $lead['talkingPoints'][] = 'Are there features you wish your website had?';
    }
    
    // Generate recommended approach based on findings
    if ($lead['conversionProbability'] === 'high') {
        $lead['recommendedApproach'] = 'Urgent outreach - clear problem to solve';
    } elseif (count($lead['painPoints']) >= 2) {
        $lead['recommendedApproach'] = 'Educational approach - show them what they are missing';
    } else {
        $lead['recommendedApproach'] = 'Nurture sequence - build relationship first';
        $lead['conversionProbability'] = 'low';
    }
    
    return $lead;
}

/**
 * Generate summary statistics for the grouped leads
 */
function generateLeadSummary($groups) {
    $totalLeads = 0;
    $highPriority = 0;
    $mediumPriority = 0;
    $lowPriority = 0;
    
    foreach ($groups as $key => $group) {
        $count = count($group['leads']);
        $totalLeads += $count;
        
        switch ($group['urgency']) {
            case 'critical':
            case 'high':
                $highPriority += $count;
                break;
            case 'medium':
                $mediumPriority += $count;
                break;
            default:
                $lowPriority += $count;
        }
    }
    
    return [
        'total' => $totalLeads,
        'highPriority' => $highPriority,
        'mediumPriority' => $mediumPriority,
        'lowPriority' => $lowPriority,
        'groupCount' => count($groups),
        'recommendation' => $highPriority > 0 
            ? "Focus on {$highPriority} high-priority leads first - they have clear problems you can solve"
            : "Build relationships with educational content for these leads"
    ];
}

/**
 * Generate email strategies for each group
 */
function generateEmailStrategies($groups) {
    $strategies = [];
    
    $strategyTemplates = [
        'no_website' => [
            'subject' => 'Quick question about {business_name}',
            'hook' => 'I noticed you don\'t have a website yet...',
            'cta' => 'Free consultation to discuss your options',
            'followUpDays' => [3, 7, 14],
            'toneRecommendation' => 'Helpful, not pushy - they may not know they need one'
        ],
        'broken_website' => [
            'subject' => 'Is your website down? (noticed something)',
            'hook' => 'I tried visiting your website and it wasn\'t loading...',
            'cta' => 'Emergency fix - can have you back online today',
            'followUpDays' => [1, 2, 5],
            'toneRecommendation' => 'Urgent but helpful - they may not know it\'s broken'
        ],
        'not_mobile_friendly' => [
            'subject' => 'Tested your site on my phone...',
            'hook' => 'I checked {business_name}\'s website on mobile and noticed some issues...',
            'cta' => 'Free mobile audit with screenshots',
            'followUpDays' => [3, 7, 14],
            'toneRecommendation' => 'Show don\'t tell - include mobile screenshots'
        ],
        'outdated_technology' => [
            'subject' => 'Quick security check for {business_name}',
            'hook' => 'I noticed your website is using some older technology...',
            'cta' => 'Free security assessment',
            'followUpDays' => [5, 10, 21],
            'toneRecommendation' => 'Technical but not scary'
        ],
        'poor_seo' => [
            'subject' => 'Why {business_name} isn\'t showing up in Google',
            'hook' => 'I searched for your services and had trouble finding you...',
            'cta' => 'Free SEO report showing exactly what to fix',
            'followUpDays' => [4, 10, 21],
            'toneRecommendation' => 'Educational with data'
        ],
        'slow_loading' => [
            'subject' => 'Your website is making customers wait',
            'hook' => 'Your site took over 3 seconds to load on my test...',
            'cta' => 'Free speed report with fixes',
            'followUpDays' => [5, 12, 21],
            'toneRecommendation' => 'Data-driven with clear ROI'
        ],
        'diy_platform' => [
            'subject' => 'Outgrowing your {platform} website?',
            'hook' => 'I noticed you\'re on {platform}. Great for starting out, but...',
            'cta' => 'Comparison of what you could unlock',
            'followUpDays' => [7, 14, 28],
            'toneRecommendation' => 'Don\'t insult their choice - show possibilities'
        ],
        'needs_refresh' => [
            'subject' => 'A few tweaks that could help {business_name}',
            'hook' => 'Looked at your website and spotted some easy wins...',
            'cta' => 'Free improvement checklist',
            'followUpDays' => [7, 14, 28],
            'toneRecommendation' => 'Collaborative partner approach'
        ],
        'good_website' => [
            'subject' => 'Nice website! One idea for {business_name}',
            'hook' => 'Your site looks great. Have you considered...',
            'cta' => 'Explore complementary services',
            'followUpDays' => [14, 30, 60],
            'toneRecommendation' => 'Nurture - build long-term relationship'
        ]
    ];
    
    foreach ($groups as $key => $group) {
        if (isset($strategyTemplates[$key])) {
            $strategies[$key] = $strategyTemplates[$key];
            $strategies[$key]['leadCount'] = count($group['leads']);
            $strategies[$key]['groupLabel'] = $group['label'];
        }
    }
    
    return $strategies;
}
