<?php
/**
 * Email Outreach API Endpoint
 * Handles email templates, campaigns, and sending
 */

require_once __DIR__ . '/includes/database.php';
require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/includes/email.php';
require_once __DIR__ . '/config.php';

require_once __DIR__ . '/includes/functions.php';

// Set proper headers
header('Content-Type: application/json');
setCorsHeaders();
handlePreflight();

// Authenticate user
$user = authenticateRequest();
if (!$user) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Unauthorized']);
    exit();
}

$action = $_GET['action'] ?? '';
$db = getDB();

try {
    switch ($action) {
        // ===== TEMPLATE ENDPOINTS =====
        case 'templates':
            handleTemplates($db, $user);
            break;
            
        case 'template':
            handleTemplate($db, $user);
            break;
            
        // ===== CAMPAIGN ENDPOINTS =====
        case 'campaigns':
            handleCampaigns($db, $user);
            break;
            
        case 'campaign':
            handleCampaign($db, $user);
            break;
            
        // ===== SEND ENDPOINTS =====
        case 'send':
            handleSendEmail($db, $user);
            break;
            
        case 'send-bulk':
            handleSendBulk($db, $user);
            break;
            
        case 'sends':
            handleSends($db, $user);
            break;
            
        // ===== TRACKING ENDPOINTS =====
        // Note: These are rate-limited but not authenticated to allow email client tracking
        case 'track-open':
            rateLimitTracking();
            handleTrackOpen($db);
            break;
            
        case 'track-click':
            rateLimitTracking();
            handleTrackClick($db);
            break;
            
        case 'stats':
            handleStats($db, $user);
            break;
            
        // ===== SCHEDULED EMAILS =====
        case 'scheduled':
            handleScheduledEmails($db, $user);
            break;
            
        case 'cancel-scheduled':
            handleCancelScheduled($db, $user);
            break;
            
        case 'process-scheduled':
            // Require cron secret key for processing scheduled emails
            $cronKey = $_GET['key'] ?? $_SERVER['HTTP_X_CRON_KEY'] ?? '';
            if (!defined('CRON_SECRET_KEY') || $cronKey !== CRON_SECRET_KEY) {
                http_response_code(403);
                echo json_encode(['success' => false, 'error' => 'Forbidden']);
                exit();
            }
            handleProcessScheduled($db);
            break;
            
        default:
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Invalid action']);
    }
} catch (Exception $e) {
    error_log("Email outreach error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Server error: ' . $e->getMessage()]);
}

// ===== TEMPLATE HANDLERS =====

function handleTemplates($db, $user) {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        // Get all templates for user
        $templates = $db->fetchAll(
            "SELECT * FROM email_templates WHERE user_id = ? ORDER BY is_default DESC, created_at DESC",
            [$user['id']]
        );
        echo json_encode(['success' => true, 'templates' => $templates ?: []]);
    } else {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    }
}

function handleTemplate($db, $user) {
    $method = $_SERVER['REQUEST_METHOD'];
    
    if ($method === 'GET') {
        $id = $_GET['id'] ?? null;
        if (!$id) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Template ID required']);
            return;
        }
        
        $template = $db->fetchOne(
            "SELECT * FROM email_templates WHERE id = ? AND user_id = ?",
            [$id, $user['id']]
        );
        
        if (!$template) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Template not found']);
            return;
        }
        
        echo json_encode(['success' => true, 'template' => $template]);
        
    } elseif ($method === 'POST') {
        // Create new template
        $data = json_decode(file_get_contents('php://input'), true);
        
        if (empty($data['name']) || empty($data['subject']) || empty($data['body_html'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Name, subject, and body are required']);
            return;
        }
        
        $id = $db->insert(
            "INSERT INTO email_templates (user_id, name, subject, body_html, body_text, is_default) VALUES (?, ?, ?, ?, ?, ?)",
            [
                $user['id'],
                $data['name'],
                $data['subject'],
                $data['body_html'],
                $data['body_text'] ?? strip_tags($data['body_html']),
                $data['is_default'] ?? false
            ]
        );
        
        echo json_encode(['success' => true, 'id' => $id, 'message' => 'Template created']);
        
    } elseif ($method === 'PUT') {
        // Update template
        $data = json_decode(file_get_contents('php://input'), true);
        $id = $_GET['id'] ?? $data['id'] ?? null;
        
        if (!$id) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Template ID required']);
            return;
        }
        
        // Verify ownership
        $template = $db->fetchOne(
            "SELECT id FROM email_templates WHERE id = ? AND user_id = ?",
            [$id, $user['id']]
        );
        
        if (!$template) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Template not found']);
            return;
        }
        
        $db->update(
            "UPDATE email_templates SET name = ?, subject = ?, body_html = ?, body_text = ?, is_default = ? WHERE id = ?",
            [
                $data['name'],
                $data['subject'],
                $data['body_html'],
                $data['body_text'] ?? strip_tags($data['body_html']),
                $data['is_default'] ?? false,
                $id
            ]
        );
        
        echo json_encode(['success' => true, 'message' => 'Template updated']);
        
    } elseif ($method === 'DELETE') {
        $id = $_GET['id'] ?? null;
        
        if (!$id) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Template ID required']);
            return;
        }
        
        $db->delete(
            "DELETE FROM email_templates WHERE id = ? AND user_id = ?",
            [$id, $user['id']]
        );
        
        echo json_encode(['success' => true, 'message' => 'Template deleted']);
    }
}

// ===== CAMPAIGN HANDLERS =====

function handleCampaigns($db, $user) {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $campaigns = $db->fetchAll(
            "SELECT c.*, t.name as template_name 
             FROM email_campaigns c 
             LEFT JOIN email_templates t ON c.template_id = t.id 
             WHERE c.user_id = ? 
             ORDER BY c.created_at DESC",
            [$user['id']]
        );
        echo json_encode(['success' => true, 'campaigns' => $campaigns ?: []]);
    } else {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    }
}

function handleCampaign($db, $user) {
    $method = $_SERVER['REQUEST_METHOD'];
    
    if ($method === 'POST') {
        $data = json_decode(file_get_contents('php://input'), true);
        
        if (empty($data['name']) || empty($data['template_id'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Name and template_id required']);
            return;
        }
        
        $id = $db->insert(
            "INSERT INTO email_campaigns (user_id, name, template_id, status, scheduled_at) VALUES (?, ?, ?, ?, ?)",
            [
                $user['id'],
                $data['name'],
                $data['template_id'],
                $data['status'] ?? 'draft',
                $data['scheduled_at'] ?? null
            ]
        );
        
        echo json_encode(['success' => true, 'id' => $id, 'message' => 'Campaign created']);
    }
}

// ===== SEND HANDLERS =====

function handleSendEmail($db, $user) {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Method not allowed']);
        return;
    }
    
    $data = json_decode(file_get_contents('php://input'), true);
    
    if (empty($data['to']) || empty($data['subject']) || empty($data['body_html'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'to, subject, and body_html are required']);
        return;
    }
    
    // Generate tracking ID
    $trackingId = bin2hex(random_bytes(32));
    
    // Personalize the email
    $subject = personalizeContent($data['subject'], $data['personalization'] ?? []);
    $bodyHtml = personalizeContent($data['body_html'], $data['personalization'] ?? []);
    
    // Add tracking pixel if enabled
    if ($data['track_opens'] ?? true) {
        $trackingPixel = '<img src="' . FRONTEND_URL . '/api/email-outreach.php?action=track-open&tid=' . $trackingId . '" width="1" height="1" style="display:none" />';
        $bodyHtml = str_replace('</body>', $trackingPixel . '</body>', $bodyHtml);
    }
    
    // Record the send
    $sendId = $db->insert(
        "INSERT INTO email_sends (user_id, lead_id, template_id, campaign_id, recipient_email, recipient_name, business_name, subject, body_html, tracking_id, status) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')",
        [
            $user['id'],
            $data['lead_id'] ?? null,
            $data['template_id'] ?? null,
            $data['campaign_id'] ?? null,
            $data['to'],
            $data['recipient_name'] ?? null,
            $data['business_name'] ?? null,
            $subject,
            $bodyHtml,
            $trackingId
        ]
    );
    
    // Send the email
    $textBody = $data['body_text'] ?? strip_tags($bodyHtml);
    $sent = sendEmail($data['to'], $subject, $bodyHtml, $textBody);
    
    if ($sent) {
        $db->update(
            "UPDATE email_sends SET status = 'sent', sent_at = NOW() WHERE id = ?",
            [$sendId]
        );
        
        // Update campaign stats if applicable
        if (!empty($data['campaign_id'])) {
            $db->update(
                "UPDATE email_campaigns SET sent_count = sent_count + 1 WHERE id = ?",
                [$data['campaign_id']]
            );
        }
        
        echo json_encode(['success' => true, 'message' => 'Email sent', 'send_id' => $sendId, 'tracking_id' => $trackingId]);
    } else {
        $db->update(
            "UPDATE email_sends SET status = 'failed', error_message = 'SMTP error' WHERE id = ?",
            [$sendId]
        );
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Failed to send email']);
    }
}

function handleSendBulk($db, $user) {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Method not allowed']);
        return;
    }
    
    $data = json_decode(file_get_contents('php://input'), true);
    
    // Support both template_id and custom subject/body
    $hasTemplate = !empty($data['template_id']);
    $hasCustomContent = !empty($data['custom_subject']) && !empty($data['custom_body']);
    
    if (empty($data['leads']) || (!$hasTemplate && !$hasCustomContent)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'leads and either template_id or custom_subject/custom_body are required']);
        return;
    }
    
    // Get the template if provided
    $template = null;
    if ($hasTemplate) {
        $template = $db->fetchOne(
            "SELECT * FROM email_templates WHERE id = ? AND user_id = ?",
            [$data['template_id'], $user['id']]
        );
        
        if (!$template) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Template not found']);
            return;
        }
    }
    
    // Use custom content or template
    $emailSubject = $data['custom_subject'] ?? ($template['subject'] ?? '');
    $emailBodyHtml = $data['custom_body'] ?? ($template['body_html'] ?? '');
    $emailBodyText = $template['body_text'] ?? strip_tags($emailBodyHtml);
    
    // Get send mode and drip config
    $sendMode = $data['send_mode'] ?? 'instant';
    $dripConfig = $data['drip_config'] ?? null;
    $scheduledFor = $data['scheduled_for'] ?? null;
    
    $results = [
        'total' => count($data['leads']),
        'sent' => 0,
        'failed' => 0,
        'skipped' => 0,
        'scheduled' => 0,
        'details' => []
    ];
    
    // For drip sending, we queue emails with scheduled times
    $emailsPerHour = $dripConfig['emailsPerHour'] ?? 20;
    $delayMinutes = $dripConfig['delayMinutes'] ?? 3;
    
    // Rate limiting - max 100 emails per request for drip, 50 for instant
    $maxPerRequest = ($sendMode === 'drip' || $sendMode === 'scheduled') ? 100 : 50;
    $leads = array_slice($data['leads'], 0, $maxPerRequest);
    
    $currentTime = new DateTime();
    $emailIndex = 0;
    
    foreach ($leads as $lead) {
        if (empty($lead['email'])) {
            $results['skipped']++;
            $results['details'][] = ['business' => $lead['business_name'] ?? 'Unknown', 'status' => 'skipped', 'reason' => 'No email'];
            continue;
        }
        
        // Prepare personalization data
        $personalization = [
            'business_name' => $lead['business_name'] ?? '',
            'first_name' => extractFirstName($lead['contact_name'] ?? $lead['business_name'] ?? ''),
            'website' => $lead['website'] ?? '',
            'platform' => $lead['platform'] ?? 'Unknown',
            'issues' => is_array($lead['issues'] ?? null) ? implode(', ', $lead['issues']) : ($lead['issues'] ?? ''),
            'phone' => $lead['phone'] ?? '',
            'email' => $lead['email'] ?? '',
        ];
        
        // Generate tracking ID
        $trackingId = bin2hex(random_bytes(32));
        
        // Personalize content
        $subject = personalizeContent($emailSubject, $personalization);
        $bodyHtml = personalizeContent($emailBodyHtml, $personalization);
        
        // Add tracking pixel
        $trackingPixel = '<img src="' . FRONTEND_URL . '/api/email-outreach.php?action=track-open&tid=' . $trackingId . '" width="1" height="1" style="display:none" />';
        if (strpos($bodyHtml, '</body>') !== false) {
            $bodyHtml = str_replace('</body>', $trackingPixel . '</body>', $bodyHtml);
        } else {
            $bodyHtml .= $trackingPixel;
        }
        
        // Calculate send time for drip mode
        $sendAt = null;
        $status = 'pending';
        
        if ($sendMode === 'drip') {
            // Stagger emails: add delay based on position
            $minutesToAdd = floor($emailIndex * (60 / $emailsPerHour));
            $sendAtTime = clone $currentTime;
            $sendAtTime->add(new DateInterval('PT' . $minutesToAdd . 'M'));
            $sendAt = $sendAtTime->format('Y-m-d H:i:s');
            $status = 'scheduled';
        } elseif ($sendMode === 'scheduled' && $scheduledFor) {
            $sendAt = date('Y-m-d H:i:s', strtotime($scheduledFor));
            $status = 'scheduled';
        }
        
        // Record the send
        $sendId = $db->insert(
            "INSERT INTO email_sends (user_id, lead_id, template_id, campaign_id, recipient_email, recipient_name, business_name, subject, body_html, tracking_id, status, scheduled_for) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                $user['id'],
                $lead['id'] ?? null,
                $data['template_id'] ?? null,
                $data['campaign_id'] ?? null,
                $lead['email'],
                $lead['contact_name'] ?? null,
                $lead['business_name'] ?? null,
                $subject,
                $bodyHtml,
                $trackingId,
                $status,
                $sendAt
            ]
        );
        
        // For instant mode, send immediately
        if ($sendMode === 'instant') {
            $textBody = personalizeContent($emailBodyText, $personalization);
            $sent = sendEmail($lead['email'], $subject, $bodyHtml, $textBody);
            
            if ($sent) {
                $db->update(
                    "UPDATE email_sends SET status = 'sent', sent_at = NOW() WHERE id = ?",
                    [$sendId]
                );
                $results['sent']++;
                $results['details'][] = ['business' => $lead['business_name'] ?? 'Unknown', 'email' => $lead['email'], 'status' => 'sent'];
            } else {
                $db->update(
                    "UPDATE email_sends SET status = 'failed', error_message = 'SMTP error' WHERE id = ?",
                    [$sendId]
                );
                $results['failed']++;
                $results['details'][] = ['business' => $lead['business_name'] ?? 'Unknown', 'email' => $lead['email'], 'status' => 'failed'];
            }
            
            // Small delay to avoid rate limiting
            usleep(100000); // 100ms delay
        } else {
            // For drip/scheduled, count as scheduled
            $results['scheduled']++;
            $results['details'][] = [
                'business' => $lead['business_name'] ?? 'Unknown', 
                'email' => $lead['email'], 
                'status' => 'scheduled',
                'scheduled_for' => $sendAt
            ];
        }
        
        $emailIndex++;
    }
    
    // For drip mode, also return estimated completion time
    if ($sendMode === 'drip' && count($leads) > 0) {
        $totalMinutes = floor(count($leads) * (60 / $emailsPerHour));
        $completionTime = clone $currentTime;
        $completionTime->add(new DateInterval('PT' . $totalMinutes . 'M'));
        $results['estimated_completion'] = $completionTime->format('Y-m-d H:i:s');
    }
    
    // Update sent count to include scheduled for reporting
    if ($sendMode !== 'instant') {
        $results['sent'] = $results['scheduled'];
    }
    
    echo json_encode(['success' => true, 'results' => $results]);
}

function handleSends($db, $user) {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $limit = intval($_GET['limit'] ?? 50);
        $offset = intval($_GET['offset'] ?? 0);
        $status = $_GET['status'] ?? null;
        
        $params = [$user['id']];
        $whereClause = "WHERE user_id = ?";
        
        if ($status) {
            $whereClause .= " AND status = ?";
            $params[] = $status;
        }
        
        $sends = $db->fetchAll(
            "SELECT * FROM email_sends $whereClause ORDER BY created_at DESC LIMIT ? OFFSET ?",
            array_merge($params, [$limit, $offset])
        );
        
        $total = $db->fetchOne(
            "SELECT COUNT(*) as count FROM email_sends $whereClause",
            $params
        );
        
        echo json_encode([
            'success' => true,
            'sends' => $sends ?: [],
            'total' => $total['count'] ?? 0
        ]);
    }
}

// ===== TRACKING HANDLERS =====

function handleTrackOpen($db) {
    $trackingId = $_GET['tid'] ?? null;
    
    if ($trackingId) {
        $db->update(
            "UPDATE email_sends SET status = 'opened', opened_at = COALESCE(opened_at, NOW()) WHERE tracking_id = ? AND status IN ('sent', 'delivered')",
            [$trackingId]
        );
        
        // Update campaign stats
        $send = $db->fetchOne("SELECT campaign_id FROM email_sends WHERE tracking_id = ?", [$trackingId]);
        if ($send && $send['campaign_id']) {
            $db->update(
                "UPDATE email_campaigns SET opened_count = opened_count + 1 WHERE id = ?",
                [$send['campaign_id']]
            );
        }
    }
    
    // Return 1x1 transparent GIF
    header('Content-Type: image/gif');
    echo base64_decode('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');
    exit();
}

function handleTrackClick($db) {
    $trackingId = $_GET['tid'] ?? null;
    $url = $_GET['url'] ?? null;
    
    if ($trackingId) {
        $db->update(
            "UPDATE email_sends SET clicked_at = COALESCE(clicked_at, NOW()) WHERE tracking_id = ? AND status IN ('sent', 'delivered', 'opened')",
            [$trackingId]
        );
        
        // Update status to clicked if not already
        $db->update(
            "UPDATE email_sends SET status = 'clicked' WHERE tracking_id = ? AND status NOT IN ('replied', 'bounced', 'failed')",
            [$trackingId]
        );
    }
    
    if ($url) {
        header('Location: ' . $url);
    }
    exit();
}

function handleStats($db, $user) {
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Method not allowed']);
        return;
    }
    
    $period = $_GET['period'] ?? '30'; // days
    
    // Overall stats
    $stats = $db->fetchOne(
        "SELECT 
            COUNT(*) as total_sent,
            SUM(CASE WHEN status = 'opened' OR status = 'clicked' OR status = 'replied' THEN 1 ELSE 0 END) as total_opened,
            SUM(CASE WHEN status = 'clicked' OR status = 'replied' THEN 1 ELSE 0 END) as total_clicked,
            SUM(CASE WHEN status = 'replied' THEN 1 ELSE 0 END) as total_replied,
            SUM(CASE WHEN status = 'bounced' THEN 1 ELSE 0 END) as total_bounced,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as total_failed
         FROM email_sends 
         WHERE user_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)",
        [$user['id'], $period]
    );
    
    // Daily stats for chart
    $dailyStats = $db->fetchAll(
        "SELECT 
            DATE(created_at) as date,
            COUNT(*) as sent,
            SUM(CASE WHEN status IN ('opened', 'clicked', 'replied') THEN 1 ELSE 0 END) as opened
         FROM email_sends 
         WHERE user_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
         GROUP BY DATE(created_at)
         ORDER BY date ASC",
        [$user['id'], $period]
    );
    
    // Calculate rates
    $totalSent = intval($stats['total_sent'] ?? 0);
    $openRate = $totalSent > 0 ? round(($stats['total_opened'] / $totalSent) * 100, 1) : 0;
    $clickRate = $totalSent > 0 ? round(($stats['total_clicked'] / $totalSent) * 100, 1) : 0;
    $replyRate = $totalSent > 0 ? round(($stats['total_replied'] / $totalSent) * 100, 1) : 0;
    
    echo json_encode([
        'success' => true,
        'stats' => [
            'total_sent' => $totalSent,
            'total_opened' => intval($stats['total_opened'] ?? 0),
            'total_clicked' => intval($stats['total_clicked'] ?? 0),
            'total_replied' => intval($stats['total_replied'] ?? 0),
            'total_bounced' => intval($stats['total_bounced'] ?? 0),
            'total_failed' => intval($stats['total_failed'] ?? 0),
            'open_rate' => $openRate,
            'click_rate' => $clickRate,
            'reply_rate' => $replyRate,
        ],
        'daily' => $dailyStats ?: []
    ]);
}

// ===== SCHEDULED EMAIL HANDLERS =====

function handleScheduledEmails($db, $user) {
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Method not allowed']);
        return;
    }
    
    $emails = $db->fetchAll(
        "SELECT id, recipient_email, recipient_name, business_name, subject, scheduled_for, created_at
         FROM email_sends 
         WHERE user_id = ? AND status = 'scheduled' AND scheduled_for IS NOT NULL
         ORDER BY scheduled_for ASC",
        [$user['id']]
    );
    
    echo json_encode(['success' => true, 'emails' => $emails ?: []]);
}

function handleCancelScheduled($db, $user) {
    if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Method not allowed']);
        return;
    }
    
    $id = $_GET['id'] ?? null;
    if (!$id) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'ID required']);
        return;
    }
    
    // Verify ownership and status
    $email = $db->fetchOne(
        "SELECT id FROM email_sends WHERE id = ? AND user_id = ? AND status = 'scheduled'",
        [$id, $user['id']]
    );
    
    if (!$email) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'Scheduled email not found']);
        return;
    }
    
    $db->update(
        "UPDATE email_sends SET status = 'cancelled' WHERE id = ?",
        [$id]
    );
    
    echo json_encode(['success' => true, 'message' => 'Scheduled email cancelled']);
}

function handleProcessScheduled($db) {
    // This is called by a cron job - no user auth needed
    // Process emails that are scheduled for now or earlier
    
    $pendingEmails = $db->fetchAll(
        "SELECT es.*, et.body_text as template_body_text
         FROM email_sends es
         LEFT JOIN email_templates et ON es.template_id = et.id
         WHERE es.status = 'scheduled' 
         AND es.scheduled_for <= NOW()
         ORDER BY es.scheduled_for ASC
         LIMIT 20",
        []
    );
    
    if (!$pendingEmails || count($pendingEmails) === 0) {
        echo json_encode(['success' => true, 'processed' => 0, 'message' => 'No emails to process']);
        return;
    }
    
    $processed = 0;
    $failed = 0;
    
    foreach ($pendingEmails as $email) {
        $textBody = $email['template_body_text'] ?? strip_tags($email['body_html']);
        $sent = sendEmail($email['recipient_email'], $email['subject'], $email['body_html'], $textBody);
        
        if ($sent) {
            $db->update(
                "UPDATE email_sends SET status = 'sent', sent_at = NOW() WHERE id = ?",
                [$email['id']]
            );
            $processed++;
        } else {
            $db->update(
                "UPDATE email_sends SET status = 'failed', error_message = 'SMTP error during scheduled send' WHERE id = ?",
                [$email['id']]
            );
            $failed++;
        }
        
        // Small delay between sends
        usleep(200000); // 200ms
    }
    
    echo json_encode([
        'success' => true, 
        'processed' => $processed, 
        'failed' => $failed,
        'message' => "Processed $processed emails, $failed failed"
    ]);
}

// ===== HELPER FUNCTIONS =====

function personalizeContent($content, $data) {
    $tokens = [
        '{{business_name}}' => $data['business_name'] ?? '',
        '{{first_name}}' => $data['first_name'] ?? 'there',
        '{{website}}' => $data['website'] ?? '',
        '{{platform}}' => $data['platform'] ?? 'Unknown',
        '{{issues}}' => $data['issues'] ?? '',
        '{{phone}}' => $data['phone'] ?? '',
        '{{email}}' => $data['email'] ?? '',
    ];
    
    return str_replace(array_keys($tokens), array_values($tokens), $content);
}

function extractFirstName($businessName) {
    // Try to extract a first name from business name
    // This is a simple heuristic - in production you'd want something more sophisticated
    $words = explode(' ', trim($businessName));
    $firstWord = $words[0] ?? '';
    
    // If it looks like a person's name (capitalized, not a common business word)
    $businessWords = ['the', 'inc', 'llc', 'corp', 'company', 'co', 'services', 'solutions'];
    if (strlen($firstWord) > 2 && !in_array(strtolower($firstWord), $businessWords)) {
        return $firstWord;
    }
    
    return 'there';
}

/**
 * Rate limit tracking endpoints to prevent abuse
 * Allows 100 requests per minute per IP
 */
function rateLimitTracking() {
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $cacheKey = 'tracking_' . md5($ip) . '_' . date('YmdHi');
    
    // Simple in-memory rate limiting using APCu if available, or file-based
    if (function_exists('apcu_exists')) {
        $count = apcu_fetch($cacheKey) ?: 0;
        if ($count >= 100) {
            http_response_code(429);
            echo json_encode(['error' => 'Rate limit exceeded']);
            exit();
        }
        apcu_store($cacheKey, $count + 1, 60);
    }
    // If APCu not available, allow through but log for monitoring
}
