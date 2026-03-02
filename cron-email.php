<?php
/**
 * Configuration file for BamLead Search API
 * 
 * INSTRUCTIONS:
 * 1. Copy the entire hostinger-backend folder to your Hostinger hosting
 * 2. Replace the placeholder values with your actual API keys
 * 3. Get a Google Custom Search API key from: https://console.cloud.google.com/
 * 4. Create a Custom Search Engine at: https://programmablesearchengine.google.com/
 * 5. Update ALLOWED_ORIGINS with your production domain
 * 6. Configure your MySQL database credentials below
 */

// =====================================
// DATABASE CONFIGURATION (Hostinger MySQL)
// =====================================
// Find these in Hostinger hPanel -> Databases -> MySQL Databases
define('DB_HOST', 'localhost');
define('DB_NAME', 'u497238762_bamlead');
define('DB_USER', 'u497238762_bamlead');
define('DB_PASS', 'YOUR_DATABASE_PASSWORD_HERE'); // <-- REPLACE THIS

// =====================================
// SERPAPI (Required for GMB Search)
// =====================================
// Get from: https://serpapi.com/manage-api-key
define('SERPAPI_KEY', 'YOUR_SERPAPI_KEY_HERE'); // <-- REPLACE THIS

// =====================================
// GOOGLE CUSTOM SEARCH API (Optional)
// =====================================
define('GOOGLE_API_KEY', '');
define('GOOGLE_SEARCH_ENGINE_ID', '');

// =====================================
// BING SEARCH API (Optional)
// =====================================
define('BING_API_KEY', '');

// =====================================
// EMAIL SETTINGS
// =====================================
define('MAIL_FROM_ADDRESS', 'noreply@bamlead.com');
define('MAIL_FROM_NAME', 'BamLead');

// SMTP Settings (for email verification)
define('SMTP_HOST', 'smtp.hostinger.com');
define('SMTP_PORT', 465);
define('SMTP_USER', 'noreply@bamlead.com');
define('SMTP_PASS', 'YOUR_NOREPLY_EMAIL_PASSWORD'); // <-- REPLACE THIS
define('SMTP_SECURE', 'ssl');

// Frontend URL (for email links)
define('FRONTEND_URL', 'https://bamlead.com');

// =====================================
// STRIPE SETTINGS
// =====================================
// Get from: https://dashboard.stripe.com/apikeys
define('STRIPE_SECRET_KEY', 'sk_live_YOUR_KEY_HERE'); // <-- REPLACE THIS
define('STRIPE_PUBLISHABLE_KEY', 'pk_live_YOUR_KEY_HERE'); // <-- REPLACE THIS
define('STRIPE_WEBHOOK_SECRET', 'whsec_YOUR_SECRET_HERE'); // <-- REPLACE THIS

// Stripe Price IDs (create in Stripe Dashboard -> Products)
define('STRIPE_PRICES', [
    'basic' => [
        'monthly' => 'price_BASIC_MONTHLY', // <-- REPLACE
        'yearly' => 'price_BASIC_YEARLY',
    ],
    'pro' => [
        'monthly' => 'price_PRO_MONTHLY', // <-- REPLACE
        'yearly' => 'price_PRO_YEARLY',
    ],
    'agency' => [
        'monthly' => 'price_AGENCY_MONTHLY', // <-- REPLACE
        'yearly' => 'price_AGENCY_YEARLY',
    ],
]);

// =====================================
// OPENAI API (For AI Features)
// =====================================
define('OPENAI_API_KEY', 'sk-YOUR_OPENAI_KEY_HERE'); // <-- REPLACE THIS

// =====================================
// GOOGLE DRIVE API (For Export Features)
// =====================================
// Get from: https://console.cloud.google.com/apis/credentials
// Create OAuth 2.0 Client ID for Web application
define('GOOGLE_DRIVE_CLIENT_ID', ''); // <-- REPLACE THIS
define('GOOGLE_DRIVE_CLIENT_SECRET', ''); // <-- REPLACE THIS
define('GOOGLE_DRIVE_REDIRECT_URI', 'https://bamlead.com/api/google-drive-callback.php');

// =====================================
// JWT SECRET (For Token Authentication)
// =====================================
// Generate at: https://randomkeygen.com/
define('JWT_SECRET', 'REPLACE_WITH_RANDOM_32_CHAR_STRING'); // <-- REPLACE THIS

// =====================================
// CORS SETTINGS
// =====================================
define('ALLOWED_ORIGINS', [
    'https://bamlead.com',
    'https://www.bamlead.com',
    'http://localhost:5173',
    'http://localhost:8080',
]);

// =====================================
// RATE LIMITING
// =====================================
// Requests per minute per IP
define('RATE_LIMIT', 30);

// =====================================
// CACHE SETTINGS
// =====================================
// Cache duration for search results (in seconds)
define('CACHE_DURATION', 300); // 5 minutes

// Enable file-based caching
define('ENABLE_CACHE', true);
define('CACHE_DIR', __DIR__ . '/cache');

// =====================================
// SESSION SETTINGS
// =====================================
define('SESSION_LIFETIME', 604800); // 7 days in seconds

// =====================================
// SUBSCRIPTION SETTINGS
// =====================================
define('TRIAL_DAYS', 14);
define('FREE_SEARCHES_PER_DAY', 5);
define('PAID_SEARCHES_PER_DAY', 100);

// =====================================
// WEBSITE ANALYSIS SETTINGS
// =====================================
// Timeout for analyzing websites (in seconds)
define('WEBSITE_TIMEOUT', 10);

// Maximum page size to download (in bytes)
define('MAX_PAGE_SIZE', 2 * 1024 * 1024); // 2MB

// =====================================
// SEARCH SETTINGS
// =====================================
// Number of results per search (max 10 for Google, 50 for Bing)
define('RESULTS_PER_PAGE', 10);

// =====================================
// DEBUG MODE
// =====================================
// Set to true to enable detailed error messages (disable in production!)
define('DEBUG_MODE', false);
