# Backend Deployment & Verification Checklist

## 🚀 Quick Start

Your backend is PHP-based and hosted on Hostinger. This checklist ensures everything works.

---

## Step 1: Upload Files to Hostinger

Upload the entire `hostinger-backend/` folder contents to `/public_html/api/`:

```
/public_html/api/
├── .htaccess
├── admin.php
├── analyze-leads.php
├── analyze-website.php
├── auth.php
├── config.php          ← Create from config.example.php
├── cron-email.php
├── diagnostics.php     ← NEW: System diagnostics
├── email-outreach.php
├── error.php
├── gmb-search.php
├── google-drive-auth.php    ← NEW: Google Drive OAuth
├── google-drive-callback.php
├── google-drive-export.php
├── health.php
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
    ├── email_outreach.sql
    ├── rate_limits.sql
    ├── subscriptions.sql
    ├── verification_tokens.sql
    ├── verified_leads.sql
    └── google_drive_tokens.sql
```

---

## Step 2: Create config.php

Copy `config.example.php` to `config.php` and fill in these values:

```php
<?php
// DATABASE - Get from Hostinger hPanel → Databases
define('DB_HOST', 'localhost');
define('DB_NAME', 'u497238762_bamlead');
define('DB_USER', 'u497238762_bamlead');
define('DB_PASS', 'YOUR_REAL_PASSWORD');  // ← CHANGE THIS

// SERPAPI - For lead search (https://serpapi.com)
define('SERPAPI_KEY', 'your_serpapi_key_here');  // ← CHANGE THIS

// EMAIL/SMTP - For sending emails
define('MAIL_FROM_ADDRESS', 'noreply@bamlead.com');
define('MAIL_FROM_NAME', 'BamLead');
define('SMTP_HOST', 'smtp.hostinger.com');
define('SMTP_PORT', 465);
define('SMTP_USER', 'noreply@bamlead.com');
define('SMTP_PASS', 'your_email_password');  // ← CHANGE THIS
define('SMTP_SECURE', 'ssl');
define('FRONTEND_URL', 'https://bamlead.com');

// STRIPE - For payments (https://dashboard.stripe.com/apikeys)
define('STRIPE_SECRET_KEY', 'sk_live_...');  // ← CHANGE THIS
define('STRIPE_PUBLISHABLE_KEY', 'pk_live_...');  // ← CHANGE THIS
define('STRIPE_WEBHOOK_SECRET', 'whsec_...');  // ← CHANGE THIS

// Price IDs from Stripe Dashboard → Products
define('STRIPE_PRICES', [
    'basic' => [
        'monthly' => 'price_xxx',  // ← Your Basic monthly price ID
        'yearly' => 'price_xxx',
    ],
    'pro' => [
        'monthly' => 'price_xxx',  // ← Your Pro monthly price ID
        'yearly' => 'price_xxx',
    ],
    'agency' => [
        'monthly' => 'price_xxx',  // ← Your Agency monthly price ID
        'yearly' => 'price_xxx',
    ],
]);

// CRON SECRET - For scheduled emails (generate random string)
define('CRON_SECRET_KEY', 'generate_a_random_32_char_string');  // ← CHANGE THIS

// JWT SECRET - For token auth (generate random string)
define('JWT_SECRET', 'another_random_32_char_string');  // ← CHANGE THIS

// OPENAI - For AI features (optional)
define('OPENAI_API_KEY', 'sk-...');  // ← Optional

// GOOGLE DRIVE - For export (optional)
define('GOOGLE_DRIVE_CLIENT_ID', '');  // ← Optional
define('GOOGLE_DRIVE_CLIENT_SECRET', '');  // ← Optional
define('GOOGLE_DRIVE_REDIRECT_URI', 'https://bamlead.com/api/google-drive-callback.php');

// OTHER SETTINGS
define('ALLOWED_ORIGINS', [
    'https://bamlead.com',
    'https://www.bamlead.com',
]);
define('RATE_LIMIT', 30);
define('CACHE_DURATION', 300);
define('ENABLE_CACHE', true);
define('CACHE_DIR', __DIR__ . '/cache');
define('SESSION_LIFETIME', 604800);
define('DEBUG_MODE', false);  // Set to true temporarily for debugging
```

---

## Step 3: Run Database Migrations

In Hostinger's phpMyAdmin, run these SQL files in order:

1. `database/schema.sql` - Core tables
2. `database/email_outreach.sql` - Email system
3. `database/rate_limits.sql` - Rate limiting
4. `database/subscriptions.sql` - Stripe subscriptions
5. `database/verification_tokens.sql` - Email verification
6. `database/verified_leads.sql` - Verified leads
7. `database/google_drive_tokens.sql` - Google Drive tokens

---

## Step 4: Set Up Cron Job

In Hostinger hPanel → Cron Jobs → Add:

**Command:**
```
wget -q -O /dev/null "https://bamlead.com/api/cron-email.php?key=YOUR_CRON_SECRET_KEY"
```

**Schedule:** Every minute (`* * * * *`)

---

## Step 5: Create Email Account

In Hostinger hPanel → Emails:
1. Create email: `noreply@bamlead.com`
2. Set a secure password
3. Update `SMTP_PASS` in config.php with this password

---

## Step 6: Verify Everything Works

### Quick Tests:

1. **Health Check:**
   ```
   https://bamlead.com/api/health.php
   ```
   Should return JSON with `status: "ok"`

2. **Full Diagnostics:**
   ```
   https://bamlead.com/api/diagnostics.php?key=YOUR_CRON_SECRET_KEY
   ```
   Shows status of all systems

3. **In Dashboard:**
   Go to Dashboard → Backend Diagnostics to run comprehensive tests

---

## Troubleshooting

### "Page Not Found" on API endpoints
- Files not uploaded to `/public_html/api/`
- Check `.htaccess` exists in `/api/`

### "Invalid JSON" responses
- PHP syntax error in `config.php`
- Check for missing quotes/semicolons
- Set `DEBUG_MODE` to `true` temporarily

### "Database connection failed"
- Wrong credentials in `config.php`
- Verify in Hostinger hPanel → Databases

### "SMTP error"
- Email account doesn't exist
- Wrong password in `config.php`
- Create email in hPanel → Emails

### "Unauthorized" on API calls
- `includes/auth.php` missing
- Session not being maintained

---

## API Endpoints Reference

| Endpoint | Purpose |
|----------|---------|
| `/api/health.php` | Health check |
| `/api/diagnostics.php?key=X` | Full system diagnostics |
| `/api/auth.php` | Login/register/logout |
| `/api/gmb-search.php` | GMB lead search |
| `/api/platform-search.php` | Platform scanner |
| `/api/analyze-leads.php` | AI lead grouping |
| `/api/email-outreach.php` | Email templates & sending |
| `/api/cron-email.php?key=X` | Process scheduled emails |
| `/api/stripe.php` | Stripe checkout/portal |
| `/api/verified-leads.php` | Saved leads management |

---

## Security Notes

⚠️ **Never commit config.php to Git** - It contains secrets

⚠️ **Set DEBUG_MODE = false** in production

⚠️ **Use HTTPS** for all API calls

⚠️ **Rotate CRON_SECRET_KEY** periodically
