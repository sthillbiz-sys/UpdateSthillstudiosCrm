-- Email Outreach Tables for BamLead
-- Run this script in your Hostinger phpMyAdmin

-- =====================================
-- EMAIL TEMPLATES TABLE
-- =====================================
CREATE TABLE IF NOT EXISTS email_templates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    body_html TEXT NOT NULL,
    body_text TEXT,
    -- Personalization tokens available: {{business_name}}, {{first_name}}, {{website}}, {{platform}}, {{issues}}, {{phone}}, {{email}}
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_is_default (is_default)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================
-- EMAIL CAMPAIGNS TABLE
-- =====================================
CREATE TABLE IF NOT EXISTS email_campaigns (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    template_id INT NOT NULL,
    status ENUM('draft', 'scheduled', 'sending', 'completed', 'paused') DEFAULT 'draft',
    scheduled_at DATETIME DEFAULT NULL,
    started_at DATETIME DEFAULT NULL,
    completed_at DATETIME DEFAULT NULL,
    total_recipients INT DEFAULT 0,
    sent_count INT DEFAULT 0,
    opened_count INT DEFAULT 0,
    clicked_count INT DEFAULT 0,
    replied_count INT DEFAULT 0,
    bounced_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (template_id) REFERENCES email_templates(id) ON DELETE RESTRICT,
    INDEX idx_user_id (user_id),
    INDEX idx_status (status),
    INDEX idx_scheduled_at (scheduled_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================
-- EMAIL SENDS TABLE (Individual email tracking)
-- =====================================
CREATE TABLE IF NOT EXISTS email_sends (
    id INT AUTO_INCREMENT PRIMARY KEY,
    campaign_id INT DEFAULT NULL,
    user_id INT NOT NULL,
    lead_id INT DEFAULT NULL,
    template_id INT DEFAULT NULL,
    recipient_email VARCHAR(255) NOT NULL,
    recipient_name VARCHAR(255),
    business_name VARCHAR(255),
    subject VARCHAR(255) NOT NULL,
    body_html TEXT,
    status ENUM('pending', 'sent', 'delivered', 'opened', 'clicked', 'replied', 'bounced', 'failed') DEFAULT 'pending',
    tracking_id VARCHAR(64) UNIQUE,
    sent_at DATETIME DEFAULT NULL,
    opened_at DATETIME DEFAULT NULL,
    clicked_at DATETIME DEFAULT NULL,
    replied_at DATETIME DEFAULT NULL,
    bounced_at DATETIME DEFAULT NULL,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (campaign_id) REFERENCES email_campaigns(id) ON DELETE SET NULL,
    FOREIGN KEY (lead_id) REFERENCES saved_leads(id) ON DELETE SET NULL,
    FOREIGN KEY (template_id) REFERENCES email_templates(id) ON DELETE SET NULL,
    INDEX idx_user_id (user_id),
    INDEX idx_campaign_id (campaign_id),
    INDEX idx_lead_id (lead_id),
    INDEX idx_status (status),
    INDEX idx_tracking_id (tracking_id),
    INDEX idx_sent_at (sent_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================
-- INSERT DEFAULT EMAIL TEMPLATES
-- =====================================
INSERT INTO email_templates (user_id, name, subject, body_html, body_text, is_default) 
SELECT 
    u.id,
    'Website Upgrade Offer',
    'I noticed your website could use some improvements',
    '<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .highlight { background: #f0fdf4; border-left: 4px solid #22c55e; padding: 12px; margin: 16px 0; }
    </style>
</head>
<body>
    <div class="container">
        <p>Hi {{first_name}},</p>
        
        <p>I came across <strong>{{business_name}}</strong> while researching local businesses in your area, and I noticed a few things about your current website that might be limiting your online presence.</p>
        
        <div class="highlight">
            <strong>Quick observations:</strong><br>
            {{issues}}
        </div>
        
        <p>These are common issues that can affect how customers find and interact with your business online. The good news is they''re all fixable!</p>
        
        <p>I specialize in helping businesses like yours improve their web presence. Would you be open to a quick 15-minute call to discuss some options?</p>
        
        <p>Best regards,<br>
        [Your Name]<br>
        [Your Company]</p>
    </div>
</body>
</html>',
    'Hi {{first_name}},

I came across {{business_name}} while researching local businesses in your area, and I noticed a few things about your current website that might be limiting your online presence.

Quick observations:
{{issues}}

These are common issues that can affect how customers find and interact with your business online. The good news is they''re all fixable!

I specialize in helping businesses like yours improve their web presence. Would you be open to a quick 15-minute call to discuss some options?

Best regards,
[Your Name]
[Your Company]',
    TRUE
FROM users u WHERE u.role = 'admin' LIMIT 1
ON DUPLICATE KEY UPDATE id=id;

INSERT INTO email_templates (user_id, name, subject, body_html, body_text, is_default) 
SELECT 
    u.id,
    'Mobile Optimization Offer',
    '{{business_name}} - Is your website mobile-friendly?',
    '<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .stat { font-size: 24px; font-weight: bold; color: #3b82f6; }
    </style>
</head>
<body>
    <div class="container">
        <p>Hi {{first_name}},</p>
        
        <p>Did you know that <span class="stat">60%+</span> of your potential customers are likely browsing on their phones?</p>
        
        <p>I was looking at {{business_name}}''s website and noticed it might not be fully optimized for mobile devices. This could mean you''re losing customers before they even get a chance to see what you offer.</p>
        
        <p>A few quick wins could make a big difference:</p>
        <ul>
            <li>Faster loading times on mobile</li>
            <li>Easy-to-tap buttons and navigation</li>
            <li>Properly sized text and images</li>
        </ul>
        
        <p>Would you like a free mobile performance report for your site? Takes just 5 minutes.</p>
        
        <p>Cheers,<br>
        [Your Name]</p>
    </div>
</body>
</html>',
    'Hi {{first_name}},

Did you know that 60%+ of your potential customers are likely browsing on their phones?

I was looking at {{business_name}}''s website and noticed it might not be fully optimized for mobile devices. This could mean you''re losing customers before they even get a chance to see what you offer.

A few quick wins could make a big difference:
- Faster loading times on mobile
- Easy-to-tap buttons and navigation
- Properly sized text and images

Would you like a free mobile performance report for your site? Takes just 5 minutes.

Cheers,
[Your Name]',
    FALSE
FROM users u WHERE u.role = 'admin' LIMIT 1
ON DUPLICATE KEY UPDATE id=id;

INSERT INTO email_templates (user_id, name, subject, body_html, body_text, is_default) 
SELECT 
    u.id,
    'Follow-up Email',
    'Following up - {{business_name}}',
    '<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <p>Hi {{first_name}},</p>
        
        <p>I reached out last week about some improvements I noticed could help {{business_name}}''s online presence.</p>
        
        <p>I know you''re busy running your business, so I wanted to follow up briefly. If improving your website is on your radar at all, I''d love to have a quick conversation.</p>
        
        <p>No pressure either way - just let me know if you''d like to chat or if you''d prefer I not follow up again.</p>
        
        <p>Best,<br>
        [Your Name]</p>
    </div>
</body>
</html>',
    'Hi {{first_name}},

I reached out last week about some improvements I noticed could help {{business_name}}''s online presence.

I know you''re busy running your business, so I wanted to follow up briefly. If improving your website is on your radar at all, I''d love to have a quick conversation.

No pressure either way - just let me know if you''d like to chat or if you''d prefer I not follow up again.

Best,
[Your Name]',
    FALSE
FROM users u WHERE u.role = 'admin' LIMIT 1
ON DUPLICATE KEY UPDATE id=id;
