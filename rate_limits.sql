-- Add Google Drive token columns to users table
-- Run this migration to enable Google Drive export feature

ALTER TABLE users 
ADD COLUMN google_drive_token TEXT NULL,
ADD COLUMN google_drive_refresh_token TEXT NULL;

-- Add index for faster lookups
CREATE INDEX idx_users_google_drive ON users(id) WHERE google_drive_token IS NOT NULL;
