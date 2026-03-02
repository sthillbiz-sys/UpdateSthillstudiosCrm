-- Call Logs Table for Voice Agent Conversations
-- Run this migration on your MySQL database

CREATE TABLE IF NOT EXISTS call_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    lead_id INT NULL,
    lead_name VARCHAR(255) NULL,
    lead_phone VARCHAR(50) NULL,
    agent_id VARCHAR(255) NOT NULL,
    duration_seconds INT NOT NULL DEFAULT 0,
    outcome ENUM('completed', 'no_answer', 'callback_requested', 'interested', 'not_interested', 'wrong_number', 'other') DEFAULT 'completed',
    notes TEXT NULL,
    transcript JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_lead_id (lead_id),
    INDEX idx_outcome (outcome),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
