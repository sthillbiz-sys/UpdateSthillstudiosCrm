-- Add scheduled_for column to email_sends table for drip/scheduled sending
-- Run this migration on your Hostinger MySQL database

ALTER TABLE email_sends 
ADD COLUMN scheduled_for DATETIME NULL DEFAULT NULL AFTER status,
ADD INDEX idx_scheduled_emails (status, scheduled_for);

-- Add cancelled status support
-- The status enum should already support 'pending', 'sent', 'delivered', etc.
-- If not, run:
-- ALTER TABLE email_sends MODIFY COLUMN status ENUM('pending', 'scheduled', 'sent', 'delivered', 'opened', 'clicked', 'replied', 'bounced', 'failed', 'cancelled') DEFAULT 'pending';
