# BamLead Security Implementation

## Security Measures Implemented

### 1. CORS Hardening
- **File**: `api/includes/functions.php`
- Removed wildcard `Access-Control-Allow-Origin: *`
- Only whitelisted origins in `ALLOWED_ORIGINS` config are allowed
- Development mode allows localhost origins only
- Added security headers: `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Referrer-Policy`, `Content-Security-Policy`

### 2. Brute Force Protection
- **File**: `api/includes/auth.php`
- Login attempts are rate-limited per IP address
- After 5 failed attempts in 15 minutes, login is blocked
- **Database**: `api/database/login_attempts.sql` (must be created)

### 3. Session Security
- Session ID regenerated on login to prevent session fixation
- Secure session cookies (HttpOnly, SameSite, Secure when HTTPS)
- Sessions stored in database with expiration

### 4. Cache Security
- **File**: `api/includes/functions.php`
- Replaced `unserialize()` with `json_decode()` to prevent object injection attacks
- Cache keys validated to prevent directory traversal

### 5. Cron Endpoint Protection
- **File**: `api/email-outreach.php`
- `process-scheduled` endpoint now requires `CRON_SECRET_KEY`
- Call with: `?action=process-scheduled&key=YOUR_SECRET`

### 6. Tracking Rate Limiting
- Email open/click tracking endpoints rate-limited to 100 requests/minute/IP
- Prevents abuse of tracking endpoints

### 7. Frontend Security
- **File**: `src/contexts/AuthContext.tsx`
- LocalStorage cache no longer stores sensitive role/subscription data
- Authorization always verified server-side
- **File**: `src/pages/Auth.tsx`
- Enhanced input validation with email format checking
- Password complexity requirements (letter + number)
- Generic error messages to prevent user enumeration

## Required Server Configuration

### 1. Create Login Attempts Table
```bash
mysql -u username -p database_name < api/database/login_attempts.sql
```

### 2. Update config.php with Allowed Origins
```php
define('ALLOWED_ORIGINS', [
    'https://bamlead.com',
    'https://www.bamlead.com',
    // Add staging/dev domains as needed
]);
```

### 3. Set Cron Secret Key
```php
define('CRON_SECRET_KEY', 'your-strong-random-secret-here');
```

## Security Best Practices Reminder

1. **Never expose API keys** in frontend code
2. **All authorization checks** happen server-side via `requireAuth()` and `requireAdmin()`
3. **Input validation** occurs on both client and server
4. **SQL injection prevention** via PDO prepared statements
5. **XSS prevention** via `htmlspecialchars()` in `sanitizeInput()`

## Remaining Recommendations

1. **Enable HTTPS only** - Redirect all HTTP to HTTPS
2. **Add rate limiting** to all endpoints using `enforceRateLimit()`
3. **Implement CSRF tokens** for form submissions
4. **Regular security audits** - Run automated scans periodically
5. **Log monitoring** - Set up alerts for suspicious activity
6. **Password hashing** - Already using bcrypt with cost 12 ✓
