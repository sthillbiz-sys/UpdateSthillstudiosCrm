# BamLead Backend Deployment Guide

## [HOSTINGER] Complete Step-by-Step Deployment

This guide will help you deploy or restore the BamLead backend on Hostinger shared hosting.

---

## 📁 Required File Structure

After deployment, your `/public_html/` should look like this:

```
/public_html/
├── .htaccess                 ← Root routing (CRITICAL)
├── api/
│   ├── .htaccess             ← API-specific rules
│   ├── admin.php
│   ├── analyze-website.php
│   ├── auth.php
│   ├── config.php            ← Server-only (NOT in GitHub)
│   ├── email-outreach.php
│   ├── error.php
│   ├── gmb-search.php
│   ├── health.php
│   ├── password.php
│   ├── platform-search.php
│   ├── stripe.php
│   ├── stripe-webhook.php
│   ├── verified-leads.php
│   ├── verify-lead.php
│   ├── includes/
│   │   ├── auth.php
│   │   ├── database.php
│   │   ├── email.php
│   │   ├── functions.php
│   │   └── stripe.php
│   └── database/
│       ├── schema.sql
│       ├── subscriptions.sql
│       ├── verification_tokens.sql
│       ├── verified_leads.sql
│       └── email_outreach.sql
└── frontend/
    └── (React build files)
```

---

## 🚀 Step-by-Step Deployment

### Step 1: Access Hostinger File Manager

1. Log into [Hostinger hPanel](https://hpanel.hostinger.com)
2. Go to **Files** → **File Manager**
3. Navigate to `/public_html/`

---

### Step 2: Create the API Folder

1. Click **New Folder**
2. Name it `api`
3. Navigate into `/public_html/api/`

---

### Step 3: Upload Backend Files

Upload all files from the `hostinger-backend/` folder in this repository:

| File | Location |
|------|----------|
| `admin.php` | `/public_html/api/` |
| `analyze-website.php` | `/public_html/api/` |
| `auth.php` | `/public_html/api/` |
| `email-outreach.php` | `/public_html/api/` |
| `error.php` | `/public_html/api/` |
| `gmb-search.php` | `/public_html/api/` |
| `health.php` | `/public_html/api/` |
| `password.php` | `/public_html/api/` |
| `platform-search.php` | `/public_html/api/` |
| `stripe.php` | `/public_html/api/` |
| `stripe-webhook.php` | `/public_html/api/` |
| `verified-leads.php` | `/public_html/api/` |
| `verify-lead.php` | `/public_html/api/` |
| `.htaccess` | `/public_html/api/` |

---

### Step 4: Create the Includes Folder

1. Inside `/public_html/api/`, click **New Folder**
2. Name it `includes`
3. Upload these files to `/public_html/api/includes/`:

| File | Purpose |
|------|---------|
| `auth.php` | Authentication helpers |
| `database.php` | Database connection |
| `email.php` | SMTP email functions |
| `functions.php` | Utility functions |
| `stripe.php` | Stripe integration |

---

### Step 5: Create config.php (Server-Only)

⚠️ **This file is NOT in GitHub** - you must create it manually.

1. In `/public_html/api/`, click **New File**
2. Name it `config.php`
3. Paste this content and fill in your values:

```php
<?php
// BamLead API Configuration - PRODUCTION

// Database Configuration
define('DB_HOST', 'localhost');
define('DB_NAME', 'u497238762_bamlead');
define('DB_USER', 'u497238762_bamlead');
define('DB_PASS', 'YOUR_DATABASE_PASSWORD');

// API Keys
define('SERPAPI_KEY', 'YOUR_SERPAPI_KEY');
define('OPENAI_API_KEY', 'YOUR_OPENAI_KEY');

// JWT Secret (generate a random 32+ character string)
define('JWT_SECRET', 'YOUR_RANDOM_SECRET_KEY');

// SMTP Configuration
define('MAIL_FROM_ADDRESS', 'noreply@bamlead.com');
define('MAIL_FROM_NAME', 'BamLead');
define('SMTP_HOST', 'smtp.hostinger.com');
define('SMTP_PORT', 465);
define('SMTP_USER', 'YOUR_EMAIL@bamlead.com');
define('SMTP_PASS', 'YOUR_SMTP_PASSWORD');
define('SMTP_SECURE', 'ssl');

// Stripe Configuration
define('STRIPE_SECRET_KEY', 'sk_live_...');
define('STRIPE_PUBLISHABLE_KEY', 'pk_live_...');
define('STRIPE_WEBHOOK_SECRET', 'whsec_...');
define('STRIPE_PRICES', [
    'basic' => [
        'monthly' => 'price_...',
        'yearly' => 'price_...'
    ],
    'pro' => [
        'monthly' => 'price_...',
        'yearly' => 'price_...'
    ],
    'agency' => [
        'monthly' => 'price_...',
        'yearly' => 'price_...'
    ]
]);

// Frontend URL
define('FRONTEND_URL', 'https://bamlead.com');

// CORS Origins
define('ALLOWED_ORIGINS', [
    'https://bamlead.com',
    'https://www.bamlead.com',
    'http://localhost:5173',
    'http://localhost:8080'
]);

// Rate Limiting
define('RATE_LIMIT', 60);

// Cache Settings
define('CACHE_DURATION', 3600);
define('ENABLE_CACHE', true);
define('CACHE_DIR', __DIR__ . '/cache');

// Session Settings
define('SESSION_LIFETIME', 86400);

// Subscription Settings
define('TRIAL_DAYS', 7);
define('FREE_SEARCHES_PER_DAY', 5);
define('PAID_SEARCHES_PER_DAY', 100);

// Website Analysis
define('WEBSITE_TIMEOUT', 10);
define('MAX_PAGE_SIZE', 1048576);

// Search Settings
define('RESULTS_PER_PAGE', 20);

// Debug Mode (set to false in production)
define('DEBUG_MODE', false);
```

---

### Step 6: Create Root .htaccess

1. Go back to `/public_html/` (root)
2. Create or edit `.htaccess` with this content:

```apache
# BamLead Routing - Root .htaccess
<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteBase /

    # Route /api/ requests to the api folder
    RewriteRule ^api/(.*)$ /api/$1 [L]

    # Don't rewrite existing files or directories
    RewriteCond %{REQUEST_FILENAME} -f [OR]
    RewriteCond %{REQUEST_FILENAME} -d
    RewriteRule ^ - [L]

    # SPA fallback - everything else goes to frontend
    RewriteRule ^ /frontend/index.html [L]
</IfModule>
```

---

### Step 7: Set File Permissions

In File Manager, right-click each item and set permissions:

| Path | Permission |
|------|------------|
| `/public_html/api/` folder | 755 |
| All `.php` files | 644 |
| `/public_html/api/cache/` folder | 755 |
| `config.php` | 600 (extra secure) |

---

### Step 8: Create Database Tables

1. Go to **Databases** → **phpMyAdmin** in hPanel
2. Select your database (`u497238762_bamlead`)
3. Go to the **SQL** tab
4. Run each SQL file from `hostinger-backend/database/` in this order:

```
1. schema.sql
2. subscriptions.sql
3. verification_tokens.sql
4. verified_leads.sql
5. email_outreach.sql
```

---

## ✅ Verification

### Test the Health Endpoint

Visit: `https://bamlead.com/api/health.php`

**Expected Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-01-05T...",
  "checks": {
    "config": true,
    "includes": true,
    "database": true
  }
}
```

### Troubleshooting

| Issue | Solution |
|-------|----------|
| 404 on `/api/health.php` | Check root `.htaccess` exists and has correct content |
| `status: degraded` | Database credentials in `config.php` are wrong |
| `config: false` | `config.php` is missing or has syntax error |
| `includes: false` | The `includes/` folder is missing |

---

## 🔄 Quick Recovery Checklist

If backend files disappear again:

- [ ] Upload all `.php` files to `/public_html/api/`
- [ ] Create `/public_html/api/includes/` folder
- [ ] Upload 5 files to `includes/`
- [ ] Recreate `config.php` with your secrets
- [ ] Verify root `.htaccess` exists
- [ ] Test `https://bamlead.com/api/health.php`

---

## 📞 Support

If automated fixes fail:
1. Screenshot the File Manager showing `/public_html/api/` contents
2. Screenshot the health.php response
3. Contact Hostinger support with: "PHP files in /api/ folder returning 404"
