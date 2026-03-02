<?php
/**
 * Cron Job Handler for Processing Scheduled Emails
 * 
 * This script should be set up as a cron job on Hostinger to run every minute:
 * 
 * Cron command:
 * * * * * * /usr/bin/php /home/u497238762/public_html/api/cron-email.php >> /home/u497238762/logs/email-cron.log 2>&1
 * 
 * Or via wget:
 * * * * * * wget -q -O /dev/null "https://bamlead.com/api/cron-email.php?key=YOUR_CRON_SECRET_KEY"
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/includes/database.php';
require_once __DIR__ . '/includes/email.php';

// Security: Check for cron key if called via HTTP
if (php_sapi_name() !== 'cli') {
    $cronKey = $_GET['key'] ?? '';
    if (!defined('CRON_SECRET_KEY') || $cronKey !== CRON_SECRET_KEY) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Invalid cron key']);
        exit();
    }
}

header('Content-Type: application/json');

try {
    $db = getDB();
    
    // Get emails scheduled for now or earlier
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
        exit();
    }
    
    $processed = 0;
    $failed = 0;
    $details = [];
    
    foreach ($pendingEmails as $email) {
        $textBody = $email['template_body_text'] ?? strip_tags($email['body_html']);
        $sent = sendEmail($email['recipient_email'], $email['subject'], $email['body_html'], $textBody);
        
        if ($sent) {
            $db->update(
                "UPDATE email_sends SET status = 'sent', sent_at = NOW() WHERE id = ?",
                [$email['id']]
            );
            $processed++;
            $details[] = [
                'id' => $email['id'],
                'email' => $email['recipient_email'],
                'status' => 'sent'
            ];
        } else {
            $db->update(
                "UPDATE email_sends SET status = 'failed', error_message = 'SMTP error during cron send' WHERE id = ?",
                [$email['id']]
            );
            $failed++;
            $details[] = [
                'id' => $email['id'],
                'email' => $email['recipient_email'],
                'status' => 'failed'
            ];
        }
        
        // Small delay between sends to avoid rate limiting
        usleep(200000); // 200ms
    }
    
    // Log results
    $logMessage = date('Y-m-d H:i:s') . " - Processed: $processed, Failed: $failed\n";
    error_log($logMessage);
    
    echo json_encode([
        'success' => true,
        'processed' => $processed,
        'failed' => $failed,
        'timestamp' => date('Y-m-d H:i:s'),
        'details' => $details
    ]);
    
} catch (Exception $e) {
    error_log("Cron email error: " . $e->getMessage());
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
