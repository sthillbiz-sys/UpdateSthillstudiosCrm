-- Verified Leads Table for BamLead
-- Stores leads that have been AI-verified and are ready for email outreach
-- Run this script in your Hostinger phpMyAdmin

CREATE TABLE IF NOT EXISTS verified_leads (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    lead_id VARCHAR(100) NOT NULL,
    business_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    contact_name VARCHAR(255),
    phone VARCHAR(50),
    website VARCHAR(500),
    address TEXT,
    platform VARCHAR(100),
    verified BOOLEAN DEFAULT TRUE,
    email_valid BOOLEAN DEFAULT FALSE,
    lead_score INT DEFAULT 0,
    ai_drafted_message TEXT,
    verification_status ENUM('pending', 'verifying', 'verified', 'failed') DEFAULT 'verified',
    issues JSON,
    source_type ENUM('gmb', 'google', 'bing', 'manual') DEFAULT 'gmb',
    outreach_status ENUM('pending', 'sent', 'replied', 'converted', 'bounced') DEFAULT 'pending',
    sent_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_lead (user_id, lead_id),
    INDEX idx_user_id (user_id),
    INDEX idx_email_valid (email_valid),
    INDEX idx_outreach_status (outreach_status),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
