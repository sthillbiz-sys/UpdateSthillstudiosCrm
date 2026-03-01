# 🔧 Backend API Fix Guide

Your **frontend is working** but your **backend API is not responding**.

---

## 🔍 Quick Diagnosis

Upload this file to your server and open it in your browser:
```
dist/api-test.html → Upload to public_html/api-test.html
```

Then visit: **https://bamlead.com/api-test.html**

It will tell you exactly what's wrong!

---

## 🚨 Most Common Issue: Backend Not Uploaded

### Problem
The `/api/` folder is missing from your server.

### Solution

**You need to upload the backend separately!**

The files you downloaded here likely only contain the **frontend** (`dist/` folder).

You also need to upload the **backend** (`api/` folder):

1. **Upload the entire `api/` folder** to your server:
   ```
   /public_html/api/
   ```

2. **Files that should be in /public_html/api/:**
   - ✅ All .php files (health.php, auth.php, gmb-search.php, etc.)
   - ✅ includes/ folder (with all helper .php files)
   - ✅ database/ folder (with all .sql migration files)
   - ✅ .htaccess file

3. **Create config.php:**
   - Copy `api/config.example.php`
   - Rename to `api/config.php`
   - Fill in all your credentials
   - Upload to `/public_html/api/config.php`

---

## ✅ Checklist After Upload

Run through this checklist:

### 1. Files Uploaded
- [ ] `/public_html/api/` folder exists
- [ ] `/public_html/api/health.php` exists
- [ ] `/public_html/api/includes/` folder exists
- [ ] `/public_html/api/.htaccess` exists
- [ ] `/public_html/.htaccess` exists (in root)

### 2. Configuration
- [ ] `/public_html/api/config.php` exists (NOT config.example.php)
- [ ] config.php has real database credentials
- [ ] config.php has real API keys
- [ ] config.php has 3 random security secrets

### 3. Database
- [ ] Database created in Supabase or Hostinger
- [ ] All SQL migrations run (from /api/database/)
- [ ] Database credentials in config.php are correct

### 4. Test It
- [ ] Visit: https://bamlead.com/api/health.php
- [ ] Should return: `{"status":"ok"}`

---

## 🎯 Step-by-Step Fix

### Step 1: Get the Backend Files

If you only have the `dist/` folder (frontend), you need the backend too.

**Backend files location:**
- In this project: `/tmp/cc-agent/62440449/project/api/`

### Step 2: Upload Backend to Server

Using FTP (FileZilla) or cPanel File Manager:

1. Connect to your server
2. Navigate to `/public_html/`
3. Upload the entire `api/` folder
4. Result: `/public_html/api/` should contain all PHP files

### Step 3: Create config.php

1. Open `api/config.example.php` in a text editor
2. Fill in these values:
   ```php
   // Database (from Supabase or Hostinger)
   define('DB_HOST', 'your_host');
   define('DB_NAME', 'your_database');
   define('DB_USER', 'your_user');
   define('DB_PASS', 'your_password');

   // SerpAPI (get from serpapi.com)
   define('SERPAPI_KEY', 'your_key_here');

   // Stripe (get from stripe.com/dashboard)
   define('STRIPE_SECRET_KEY', 'sk_test_your_key');
   define('STRIPE_PUBLISHABLE_KEY', 'pk_test_your_key');

   // OpenAI (get from platform.openai.com)
   define('OPENAI_API_KEY', 'sk-your_key');

   // SMTP (your email settings)
   define('SMTP_HOST', 'smtp.hostinger.com');
   define('SMTP_USER', 'noreply@bamlead.com');
   define('SMTP_PASS', 'your_email_password');

   // Security (generate random 32-char strings)
   define('JWT_SECRET', 'random_32_characters_here');
   define('TRACKING_SECRET', 'random_32_characters_here');
   define('CRON_SECRET_KEY', 'random_32_characters_here');
   ```

3. Save as `config.php` (NOT config.example.php)
4. Upload to `/public_html/api/config.php`

### Step 4: Setup Database

1. Log into Supabase or phpMyAdmin
2. Run these SQL files in order:
   - `api/database/schema.sql`
   - `api/database/subscriptions.sql`
   - `api/database/email_outreach.sql`
   - `api/database/verified_leads.sql`
   - All other .sql files

### Step 5: Test

Visit: **https://bamlead.com/api/health.php**

**Should see:**
```json
{
  "status": "ok",
  "checks": {
    "database_connected": true,
    "config_exists": true
  }
}
```

---

## 📞 Still Not Working?

### Check PHP Error Logs
1. Log into cPanel
2. Go to **Error Log**
3. Look for recent PHP errors

### Check File Permissions
```bash
chmod 644 /public_html/api/*.php
chmod 600 /public_html/api/config.php
chmod 755 /public_html/api/includes/
```

### Enable Debug Mode Temporarily
In config.php, set:
```php
define('DEBUG_MODE', true);
```

Then visit `/api/health.php` to see detailed errors.

**Remember to set it back to `false` after fixing!**

---

## 🎉 Success!

Once the health check passes, your full site will work:
- ✅ User registration/login
- ✅ Lead search (GMB & Platform Scanner)
- ✅ Email outreach
- ✅ CRM features
- ✅ Payment processing

---

## 📂 Quick Reference: Where Everything Goes

```
public_html/
├── index.html              ← Frontend (from dist/)
├── assets/                 ← Frontend JS/CSS (from dist/)
├── favicon.ico             ← Frontend (from dist/)
├── .htaccess              ← Routes /api to backend
├── api-test.html          ← Diagnostic tool (NEW!)
└── api/                   ← Backend PHP files (NEW!)
    ├── .htaccess
    ├── config.php         ← YOU CREATE THIS
    ├── health.php
    ├── auth.php
    ├── (all other .php files)
    ├── includes/
    │   └── (all helper files)
    └── database/
        └── (all .sql files)
```

---

**Need the backend files?** They're in the project folder at `/api/`

**Quick test:** https://bamlead.com/api-test.html
