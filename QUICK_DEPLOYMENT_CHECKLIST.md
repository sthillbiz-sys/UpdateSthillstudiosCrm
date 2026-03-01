# ✅ Quick Deployment Checklist

Use this checklist to deploy BamLead in 30 minutes!

---

## 📦 STEP 1: Build Frontend (2 minutes)

```bash
npm run build
```

**Result:** Creates `dist/` folder with production files

---

## 🌐 STEP 2: Upload Frontend (5 minutes)

**Using FTP (FileZilla) or cPanel File Manager:**

Upload **contents** of `dist/` folder to:
```
/public_html/
```

**Files to upload:**
- ✅ `index.html`
- ✅ `assets/` folder (all files)
- ✅ `favicon.ico`
- ✅ `favicon.png`
- ✅ `robots.txt`
- ✅ `.htaccess` (from project root)
- ✅ `test-connection.html` (for testing)

---

## 🔧 STEP 3: Upload Backend (5 minutes)

Upload entire `api/` folder to:
```
/public_html/api/
```

**Include:**
- ✅ All `.php` files
- ✅ `includes/` folder
- ✅ `database/` folder
- ✅ `.htaccess` file

**DO NOT upload:**
- ❌ `config.example.php` (it's just a template)

---

## 🔑 STEP 4: Create config.php (10 minutes)

**Location:** `/public_html/api/config.php`

**Get these keys:**

1. **Database** (from Hostinger or Supabase dashboard)
   - DB_HOST
   - DB_NAME
   - DB_USER
   - DB_PASS

2. **SerpAPI** → https://serpapi.com
   - SERPAPI_KEY

3. **Stripe** → https://dashboard.stripe.com/apikeys
   - STRIPE_SECRET_KEY
   - STRIPE_PUBLISHABLE_KEY
   - STRIPE_WEBHOOK_SECRET

4. **OpenAI** → https://platform.openai.com/api-keys
   - OPENAI_API_KEY

5. **SMTP Email** (from your email host)
   - SMTP_HOST
   - SMTP_USER
   - SMTP_PASS

6. **Security Secrets** → https://randomkeygen.com
   - JWT_SECRET (32 random characters)
   - TRACKING_SECRET (32 random characters)
   - CRON_SECRET_KEY (32 random characters)

**Copy template from:** `api/config.example.php`

---

## 🗄️ STEP 5: Setup Database (5 minutes)

**Using phpMyAdmin or Supabase SQL Editor:**

Run these SQL files **in order:**

1. ✅ `api/database/schema.sql`
2. ✅ `api/database/add_rls_policies.sql`
3. ✅ `api/database/subscriptions.sql`
4. ✅ `api/database/email_outreach.sql`
5. ✅ `api/database/verified_leads.sql`
6. ✅ `api/database/call_logs.sql`
7. ✅ `api/database/crm_leads.sql`
8. ✅ `api/database/verification_tokens.sql`
9. ✅ `api/database/rate_limits.sql`
10. ✅ `api/database/login_attempts.sql`

---

## ✅ STEP 6: Test Everything (3 minutes)

### Test 1: Backend Health
Visit: `https://bamlead.com/api/health.php`

**Should see:**
```json
{
  "status": "ok",
  "checks": {
    "database_connected": true
  }
}
```

### Test 2: Full System Test
Visit: `https://bamlead.com/test-connection.html`

**Should show:**
- ✅ Frontend Build: PASS
- ✅ Backend API Health: PASS
- ✅ Configuration Check: PASS
- ✅ Database Connection: PASS

### Test 3: Frontend
Visit: `https://bamlead.com`

**Should see:**
- React app loads
- No console errors
- Can navigate pages

---

## 🚨 If Tests Fail

### Backend Health returns 404
- ❌ Problem: `.htaccess` missing or not working
- ✅ Solution: Upload `.htaccess` to both root and `/api/`

### Backend returns 500 error
- ❌ Problem: `config.php` missing or has errors
- ✅ Solution: Check config.php exists and has correct syntax

### Database connection fails
- ❌ Problem: Wrong database credentials
- ✅ Solution: Verify credentials in Supabase/Hostinger panel

### Frontend shows blank page
- ❌ Problem: Files not uploaded correctly
- ✅ Solution: Ensure all files from `dist/` are in root

---

## 🎉 You're Done!

Your site should now be live at:
### **https://bamlead.com**

---

## 📝 What's Next?

1. ✅ Create your admin account
2. ✅ Test search functionality
3. ✅ Configure email templates
4. ✅ Set up Stripe products
5. ✅ Configure cron jobs (for automated emails)

---

## 💡 Pro Tips

- **Keep config.php secure** - Never commit to GitHub
- **Enable SSL** - Force HTTPS in Hostinger
- **Set up backups** - Daily automated backups in Hostinger
- **Monitor logs** - Check `/api/error_log` regularly
- **Use test-connection.html** - Quick health check anytime

---

## 📞 Need Help?

- Full guide: `DEPLOYMENT_GUIDE.md`
- Backend docs: `api/DEPLOYMENT.md`
- Test results: `BACKEND_TEST_RESULTS.md`
- Health check: `https://bamlead.com/api/health.php`

---

**Estimated Total Time:** 30 minutes
**Difficulty:** Easy (if you have all API keys ready)

Good luck! 🚀
