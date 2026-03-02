# BamLead API Backend for Hostinger

Complete PHP backend for the BamLead lead generation platform.

## Quick Setup

1. **Upload to Hostinger**
   - Upload this entire `hostinger-backend` folder to your Hostinger hosting
   - Recommended location: `public_html/api/`

2. **Configure API Keys**
   - Open `config.php` and add your API keys:
   - Get Google Custom Search API key from: https://console.cloud.google.com/
   - Create Search Engine at: https://programmablesearchengine.google.com/
   - (Optional) Get Bing API key from: https://portal.azure.com/

3. **Set Permissions**
   ```bash
   chmod 755 api/
   chmod 644 api/*.php
   chmod 755 cache/
   chmod 644 config.php
   chmod 755 includes/
   ```

4. **Update CORS Origins**
   - Edit `config.php` and add your frontend domain to `ALLOWED_ORIGINS`

## File Structure

```
hostinger-backend/
├── api/
│   ├── gmb-search.php        # GMB search endpoint
│   ├── platform-search.php   # Platform detection search
│   ├── verify-lead.php       # Lead verification
│   └── analyze-website.php   # Single website analysis
├── includes/
│   └── functions.php         # Shared helper functions
├── cache/                    # Cache directory (auto-created)
├── config.php               # Configuration file
├── .htaccess                # Apache configuration
└── README.md                # This file
```

## API Endpoints

### GMB Search
Search Google My Business listings.

```
POST /api/gmb-search.php

Request:
{
  "service": "plumber",
  "location": "Austin, TX"
}

Response:
{
  "success": true,
  "data": [...],
  "query": { "service": "...", "location": "..." }
}
```

### Platform Search
Search for websites using specific platforms (WordPress, Wix, etc.).

```
POST /api/platform-search.php

Request:
{
  "service": "dentist",
  "location": "Denver, CO",
  "platforms": ["wordpress", "wix", "weebly"]
}

Response:
{
  "success": true,
  "data": [...],
  "query": { "service": "...", "location": "...", "platforms": [...] }
}
```

### Lead Verification
Verify and enrich lead data from a website.

```
POST /api/verify-lead.php

Request:
{
  "url": "https://example-business.com",
  "leadId": "lead_123"
}

Response:
{
  "success": true,
  "data": {
    "isAccessible": true,
    "contactInfo": { "phones": [...], "emails": [...] },
    "businessInfo": { "name": "...", "socialLinks": {...} },
    "websiteAnalysis": {...}
  }
}
```

### Analyze Website
Analyze a single website for platform and issues.

```
GET /api/analyze-website.php?url=https://example.com
POST /api/analyze-website.php
{ "url": "https://example.com" }

Response:
{
  "success": true,
  "data": {
    "platform": "WordPress",
    "issues": [...],
    "mobileScore": 65,
    "needsUpgrade": true
  }
}
```

## Frontend Configuration

Update your frontend to point to the API:

```javascript
// In your .env or environment config
VITE_API_URL=https://yourdomain.com/api
```

Or directly in code:
```javascript
const API_BASE_URL = 'https://yourdomain.com/api';
```

## Testing

Without API keys configured, the endpoints return mock data for testing.

Test with curl:
```bash
curl -X POST https://yourdomain.com/api/gmb-search.php \
  -H "Content-Type: application/json" \
  -d '{"service":"plumber","location":"Austin TX"}'
```

## Features

- ✅ GMB Business Search
- ✅ Platform Detection (WordPress, Wix, Squarespace, etc.)
- ✅ Website Quality Analysis
- ✅ Lead Verification & Enrichment
- ✅ Contact Info Extraction (phones, emails)
- ✅ Social Media Link Detection
- ✅ Response Caching
- ✅ Mock Data for Testing

## Troubleshooting

1. **500 errors**: Check PHP error logs, ensure all files uploaded correctly
2. **CORS errors**: Verify your domain is in ALLOWED_ORIGINS in config.php
3. **Empty results**: Check if API keys are configured (mock data returns if not)
4. **Cache issues**: Delete files in `cache/` directory

## Security Notes

- Keep `config.php` secure - contains API keys
- The `includes/` and `cache/` directories are protected via .htaccess
- Rate limiting is configured but not fully implemented (add Redis for production)
- Consider adding authentication for production use
