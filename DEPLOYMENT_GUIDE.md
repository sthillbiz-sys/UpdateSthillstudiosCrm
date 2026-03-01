# 🚀 BamLead Complete Deployment Guide

## Complete guide for deploying bamlead.com to production

---

## ⚡ Quick Start (30 Minutes)

1. **Build frontend**: `npm run build`
2. **Upload `dist/` contents** to `public_html/`
3. **Upload `api/` folder** to `public_html/api/`
4. **Create `config.php`** with your API keys (see Step 3 below)
5. **Run database migrations** in phpMyAdmin
6. **Test**: Open `https://bamlead.com/test-connection.html`

**Test File Included:** `test-connection.html` - Upload to root and open in browser for instant connectivity check!

---

## 📋 Pre-Deployment Checklist

Before deploying, ensure you have:

- ✅ Hostinger hosting account access
- ✅ Database credentials (from Hostinger hPanel)
- ✅ SERPAPI key (for Google Maps Business search)
- ✅ SMTP credentials (for sending emails)
- ✅ Stripe API keys (for payments)
- ✅ OpenAI API key (for AI features)
- ✅ SSL certificate (automatic with Hostinger)

---

## 🎯 Deployment Overview

BamLead has two components:
1. **Frontend**: React/Vite application (build files)
2. **Backend**: PHP REST API with MySQL database

**Deployment Structure:**
```
/public_html/
├── .htaccess              ← Routes /api to backend, everything else to frontend
├── index.html             ← Frontend entry point
├── assets/                ← Frontend JS/CSS/images
├── favicon.ico
└── api/                   ← Backend PHP files
    ├── .htaccess
    ├── config.php         ← YOU CREATE THIS (not in GitHub)
    ├── *.php              ← API endpoints
    ├── includes/          ← Helper functions
    └── database/          ← SQL migration files
```

---

## PART 1: Deploy Backend (API)

### Step 1: Access Hostinger File Manager

1. Log into [Hostinger hPanel](https://hpanel.hostinger.com)
2. Navigate to **Files** → **File Manager**
3. Go to `/public_html/`

### Step 2: Upload Backend Files

1. Create folder: `/public_html/api/`
2. Upload ALL files from `api/` folder EXCEPT `config.example.php`

**Files to upload:**
```
api/
├── .htaccess
├── admin.php
├── analyze-leads.php
├── analyze-website.php
├── auth.php
├── call-logs.php
├── crm-activity.php
├── crm-leads.php
├── cron-email.php
├── diagnostics.php
├── email-outreach.php
├── error.php
├── gmb-search.php
├── google-drive-auth.php
├── google-drive-callback.php
├── google-drive-export.php
├── health.php
├── lead-notes.php
├── lead-segments.php
├── password.php
├── platform-search.php
├── stripe.php
├── stripe-webhook.php
├── verified-leads.php
├── verify-lead.php
├── includes/
│   ├── auth.php
│   ├── database.php
│   ├── email.php
│   ├── functions.php
│   ├── ratelimit.php
│   └── stripe.php
└── database/
    ├── schema.sql
    ├── add_rls_policies.sql
    ├── (all other .sql files)
```

### Step 3: Create config.php (CRITICAL)

**⚠️ DO NOT upload config.example.php - it's a template only!**

1. In `/public_html/api/`, create new file: `config.php`
2. Use this template and **fill in ALL values**:

```php
<?php
/**
 * BamLead Production Configuration
 * KEEP THIS FILE SECRET - Never commit to GitHub
 */

// =====================================
// DATABASE CONFIGURATION
// =====================================
define('DB_HOST', 'localhost');
define('DB_NAME', 'u497238762_bamlead');  // Your database name
define('DB_USER', 'u497238762_bamlead');  // Your database user
define('DB_PASS', 'YOUR_DATABASE_PASSWORD_HERE'); // FROM HOSTINGER

// =====================================
// SERPAPI (Required for GMB Search)
// =====================================
define('SERPAPI_KEY', 'YOUR_SERPAPI_KEY_HERE'); // Get from serpapi.com

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

// SMTP Settings
define('SMTP_HOST', 'smtp.hostinger.com');
define('SMTP_PORT', 465);
define('SMTP_USER', 'noreply@bamlead.com'); // Your email
define('SMTP_PASS', 'YOUR_EMAIL_PASSWORD'); // Email password
define('SMTP_SECURE', 'ssl');

// Frontend URL
define('FRONTEND_URL', 'https://bamlead.com');

// =====================================
// STRIPE SETTINGS
// =====================================
define('STRIPE_SECRET_KEY', 'sk_live_YOUR_KEY');
define('STRIPE_PUBLISHABLE_KEY', 'pk_live_YOUR_KEY');
define('STRIPE_WEBHOOK_SECRET', 'whsec_YOUR_SECRET');

define('STRIPE_PRICES', [
    'basic' => [
        'monthly' => 'price_XXXXXXX', // From Stripe Dashboard
        'yearly' => 'price_XXXXXXX',
    ],
    'pro' => [
        'monthly' => 'price_XXXXXXX',
        'yearly' => 'price_XXXXXXX',
    ],
    'agency' => [
        'monthly' => 'price_XXXXXXX',
        'yearly' => 'price_XXXXXXX',
    ],
]);

// =====================================
// OPENAI API (For AI Features)
// =====================================
define('OPENAI_API_KEY', 'sk-YOUR_OPENAI_KEY');

// =====================================
// GOOGLE DRIVE API (Optional)
// =====================================
define('GOOGLE_DRIVE_CLIENT_ID', '');
define('GOOGLE_DRIVE_CLIENT_SECRET', '');
define('GOOGLE_DRIVE_REDIRECT_URI', 'https://bamlead.com/api/google-drive-callback.php');

// =====================================
// SECURITY SECRETS (REQUIRED!)
// =====================================
// Generate random 32-char strings at: https://randomkeygen.com/

// JWT Secret
define('JWT_SECRET', 'REPLACE_WITH_32_RANDOM_CHARACTERS');

// Email Tracking Secret
define('TRACKING_SECRET', 'REPLACE_WITH_32_RANDOM_CHARACTERS');

// Cron Job Secret
define('CRON_SECRET_KEY', 'REPLACE_WITH_32_RANDOM_CHARACTERS');

// Cron Allowed IPs (optional - restrict cron to specific IPs)
define('CRON_ALLOWED_IPS', []); // Example: ['10.0.0.1', '192.168.1.0/24']

// =====================================
// CORS SETTINGS
// =====================================
define('ALLOWED_ORIGINS', [
    'https://bamlead.com',
    'https://www.bamlead.com',
]);

// =====================================
// RATE LIMITING
// =====================================
define('RATE_LIMIT', 30);

// =====================================
// CACHE SETTINGS
// =====================================
define('CACHE_DURATION', 300);
define('ENABLE_CACHE', true);
define('CACHE_DIR', __DIR__ . '/cache');

// =====================================
// SESSION SETTINGS
// =====================================
define('SESSION_LIFETIME', 604800);

// =====================================
// SUBSCRIPTION SETTINGS
// =====================================
define('TRIAL_DAYS', 14);
define('FREE_SEARCHES_PER_DAY', 5);
define('PAID_SEARCHES_PER_DAY', 100);

// =====================================
// WEBSITE ANALYSIS SETTINGS
// =====================================
define('WEBSITE_TIMEOUT', 10);
define('MAX_PAGE_SIZE', 2097152);

// =====================================
// SEARCH SETTINGS
// =====================================
define('RESULTS_PER_PAGE', 10);

// =====================================
// DEBUG MODE
// =====================================
define('DEBUG_MODE', false); // ALWAYS FALSE IN PRODUCTION!
```

3. Set file permissions to `600` (owner read/write only)

### Step 4: Create Cache Directory

1. In `/public_html/api/`, create folder: `cache`
2. Set permissions to `755`

### Step 5: Set Up Database

1. Go to **Databases** → **phpMyAdmin**
2. Select your database
3. Click **SQL** tab
4. Run these files IN ORDER:

```sql
-- 1. Create tables
Run: api/database/schema.sql

-- 2. Add security policies
Run: api/database/add_rls_policies.sql

-- 3. Add subscriptions table
Run: api/database/subscriptions.sql

-- 4. Add other tables
Run: api/database/verification_tokens.sql
Run: api/database/verified_leads.sql
Run: api/database/email_outreach.sql
Run: api/database/call_logs.sql
Run: api/database/crm_leads.sql
Run: api/database/sms_logs.sql
Run: api/database/google_drive_tokens.sql
Run: api/database/rate_limits.sql
Run: api/database/login_attempts.sql
```

### Step 6: Create Admin Account

**DO NOT use default credentials!**

1. In phpMyAdmin SQL tab, run:

```sql
-- Generate your password hash in PHP first:
-- <?php echo password_hash('YOUR_SECURE_PASSWORD', PASSWORD_DEFAULT); ?>

INSERT INTO users (email, password_hash, name, role, subscription_status, is_owner)
VALUES (
    'your-email@bamlead.com',
    '$2y$10$YOUR_GENERATED_HASH_HERE',
    'Your Name',
    'admin',
    'active',
    TRUE
);
```

### Step 7: Test Backend

Visit: `https://bamlead.com/api/health.php`

**Expected Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-01-13...",
  "checks": {
    "config": true,
    "includes": true,
    "database": true
  }
}
```

If you see errors, check:
- ❌ `config: false` → config.php has syntax error or missing
- ❌ `database: false` → wrong database credentials
- ❌ 404 error → .htaccess not working
- ❌ 500 error → PHP error, check error logs

---

## PART 2: Deploy Frontend

### Step 1: Build Frontend

On your local machine:

```bash
cd /path/to/project
npm run build
```

This creates the `dist/` folder with production files.

### Step 2: Upload Frontend Files

Upload **contents** of `dist/` folder to `/public_html/`:

```
/public_html/
├── index.html
├── favicon.ico
├── favicon.png
├── image.png
├── placeholder.svg
├── robots.txt
└── assets/
    ├── index-XXXXX.js
    ├── index-XXXXX.css
    └── (other asset files)
```

**⚠️ Important**: Upload files FROM INSIDE dist/, not the dist folder itself!

### Step 3: Create Root .htaccess

Create/edit `/public_html/.htaccess`:

```apache
# BamLead Production Routing
<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteBase /

    # Security: Block access to sensitive files
    <FilesMatch "^\.env">
        Order allow,deny
        Deny from all
    </FilesMatch>

    # Route /api/ requests to backend
    RewriteRule ^api/(.*)$ api/$1 [L,QSA]

    # Don't rewrite existing files
    RewriteCond %{REQUEST_FILENAME} -f [OR]
    RewriteCond %{REQUEST_FILENAME} -d
    RewriteRule ^ - [L]

    # SPA routing - everything else to index.html
    RewriteRule ^ index.html [L]
</IfModule>

# Security Headers
<IfModule mod_headers.c>
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-Frame-Options "DENY"
    Header always set X-XSS-Protection "1; mode=block"
    Header always set Referrer-Policy "strict-origin-when-cross-origin"
</IfModule>

# Enable GZIP compression
<IfModule mod_deflate.c>
    AddOutputFilterByType DEFLATE text/html text/plain text/xml text/css text/javascript application/javascript application/json
</IfModule>

# Browser caching
<IfModule mod_expires.c>
    ExpiresActive On
    ExpiresByType image/jpg "access plus 1 year"
    ExpiresByType image/jpeg "access plus 1 year"
    ExpiresByType image/png "access plus 1 year"
    ExpiresByType image/gif "access plus 1 year"
    ExpiresByType text/css "access plus 1 month"
    ExpiresByType application/javascript "access plus 1 month"
</IfModule>
```

### Step 4: Update Environment Variables

The frontend build should already have the correct API URL. If you need to change it:

1. Edit `.env` locally:
```
VITE_API_URL=https://bamlead.com/api
```

2. Rebuild:
```bash
npm run build
```

3. Re-upload `dist/` contents

---

## PART 3: Configure Domain & SSL

### Step 1: SSL Certificate

1. In Hostinger hPanel, go to **SSL**
2. If not already active, click **Install SSL**
3. Wait 5-10 minutes for activation

### Step 2: Force HTTPS

Add to top of `/public_html/.htaccess`:

```apache
# Force HTTPS
<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteCond %{HTTPS} off
    RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
</IfModule>
```

### Step 3: WWW Redirect (Optional)

To redirect www to non-www:

```apache
RewriteCond %{HTTP_HOST} ^www\.bamlead\.com [NC]
RewriteRule ^(.*)$ https://bamlead.com/$1 [L,R=301]
```

---

## PART 4: Set Up Cron Jobs

### Email Sending Cron

1. In Hostinger hPanel, go to **Advanced** → **Cron Jobs**
2. Create new cron job:

```
Frequency: Every 1 minute
Command: wget -q -O /dev/null "https://bamlead.com/api/cron-email.php?key=YOUR_CRON_SECRET_KEY"
```

Replace `YOUR_CRON_SECRET_KEY` with the value from your config.php

### Rate Limit Cleanup (Optional)

```
Frequency: Every hour
Command: wget -q -O /dev/null "https://bamlead.com/api/cron-cleanup.php?key=YOUR_CRON_SECRET_KEY"
```

---

## ✅ Post-Deployment Verification

### 0. Use Automated Test Page (RECOMMENDED)
- Upload `test-connection.html` to `/public_html/`
- Visit: `https://bamlead.com/test-connection.html`
- Should show all tests passing ✅
- This tests: Frontend, Backend API, Configuration, Database

### 1. Test Website Loading
- Visit: `https://bamlead.com`
- Should see homepage with no errors

### 2. Test API Health
- Visit: `https://bamlead.com/api/health.php`
- Should return `{"status":"ok"}` or `{"status":"healthy"}`

### 3. Test Authentication
- Try registering a new account
- Try logging in
- Check that session persists

### 4. Test Features
- Try searching for leads
- Try email functionality
- Test payment flow (if Stripe configured)

### 5. Check Browser Console
- Open DevTools (F12)
- Should see no errors
- API calls should return 200 status

### 6. Test Mobile
- Open site on mobile device
- Check responsiveness
- Test all major features

---

## 🔧 Troubleshooting

### Issue: 404 on API endpoints

**Solution:**
- Check `/public_html/.htaccess` exists
- Verify RewriteEngine is On
- Check Hostinger has mod_rewrite enabled

### Issue: CORS errors

**Solution:**
- Add your domain to `ALLOWED_ORIGINS` in config.php
- Clear browser cache
- Check API response headers

### Issue: Database connection failed

**Solution:**
- Verify database credentials in config.php
- Check database exists in phpMyAdmin
- Ensure database user has proper permissions

### Issue: 500 Internal Server Error

**Solution:**
- Check PHP error logs in Hostinger
- Enable `DEBUG_MODE` temporarily in config.php
- Check file permissions (should be 644 for .php files)

### Issue: Email not sending

**Solution:**
- Verify SMTP credentials
- Test with simple script
- Check email logs in Hostinger
- Ensure ports 465/587 are not blocked

### Issue: White screen / blank page

**Solution:**
- Check browser console for errors
- Verify index.html exists in root
- Check .htaccess SPA routing
- Clear browser cache

---

## 🔒 Security Checklist

After deployment, verify:

- ✅ `DEBUG_MODE = false` in config.php
- ✅ config.php has 600 permissions (not readable by others)
- ✅ No .env file in public_html
- ✅ SSL certificate is active (https://)
- ✅ Security secrets are unique random strings
- ✅ Default admin password changed
- ✅ CORS only allows bamlead.com
- ✅ Rate limiting is active
- ✅ Error logs don't expose sensitive info

---

## 📊 Performance Optimization

### Enable OPcache

Add to `/public_html/api/.htaccess`:

```apache
<IfModule mod_php7.c>
    php_flag opcache.enable On
    php_value opcache.memory_consumption 128
    php_value opcache.max_accelerated_files 10000
</IfModule>
```

### Enable CDN (Optional)

Consider using Cloudflare for:
- Faster asset delivery
- DDoS protection
- Additional caching

---

## 🔄 Updating the Site

When you make changes:

### Backend Updates:
1. Upload changed `.php` files to `/public_html/api/`
2. If database changes, run new SQL migrations
3. Test `/api/health.php`

### Frontend Updates:
1. Run `npm run build` locally
2. Upload new `dist/` contents to `/public_html/`
3. Clear browser cache to see changes

### Database Updates:
1. Always backup database first!
2. Run SQL migrations in phpMyAdmin
3. Test thoroughly

---

## 💾 Backup Strategy

### Daily Automated Backups (Hostinger)
- Enabled by default
- 7-day retention
- Includes files + database

### Manual Backups
1. **Database**: phpMyAdmin → Export
2. **Files**: File Manager → Compress → Download
3. Store backups off-server

---

## 📞 Support Resources

- **Hostinger Support**: 24/7 live chat
- **Documentation**: SECURITY_FIXES_APPLIED.md
- **Backend API**: api/DEPLOYMENT.md
- **Health Check**: https://bamlead.com/api/health.php

---

## ✨ You're Live!

Your website should now be live at:
- 🌐 https://bamlead.com

Congratulations on launching BamLead! 🎉

---

**Last Updated**: 2026-01-13
**Version**: 1.0 (with security fixes)
