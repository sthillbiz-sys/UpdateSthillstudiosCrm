# BamLead Quick Start Guide

## For Website Owners/Admins

### 🚀 Getting Your Site Ready

#### 1. Deploy to bamlead.com
```bash
# Upload these folders to your hosting:
- /dist/               → Your website files
- /api/                → Backend API
- /chrome-extension/   → Extension files
- /.htaccess          → URL rules
```

#### 2. Database Setup
```bash
# Run these SQL files in order:
1. /api/database/schema.sql
2. /api/database/crm_leads.sql
3. /api/database/email_outreach.sql
```

#### 3. Configure Environment
```bash
# Edit /api/config.example.php and rename to config.php
- Set database credentials
- Set Stripe keys
- Set email SMTP settings
```

---

## For End Users (Your Customers)

### 📱 Using BamLead is Easy!

#### Step 1: Search for Leads
1. Login to bamlead.com/dashboard
2. See two big options:
   - **OPTION A**: Search businesses on Google Maps
   - **OPTION B**: Scan websites by platform
3. Click one option
4. Fill in:
   - Business type (e.g., "plumbers")
   - Location (e.g., "New York, NY")
5. Click the big "Search" button
6. Wait while it searches (progress bar shows status)

#### Step 2: Review Lead Intelligence Report
1. Report automatically appears when search completes
2. See stats:
   - Hot leads (red) - highest priority
   - Warm leads (orange) - medium priority
   - Cold leads (blue) - lower priority
3. Review tabs:
   - Executive Summary - quick overview
   - All Leads - full list with checkboxes
   - AI Insights - smart recommendations
4. Select leads you want (or use recommended hot leads)
5. Click big "Proceed to Verify" button at bottom

#### Step 3: Verify Contact Info
1. Premium leads display opens
2. AI finds emails and phone numbers
3. Marks leads as verified
4. Shows confidence score for each contact
5. Click "Send to Email" when ready

#### Step 4: Configure SMTP (First Time Only)
1. If yellow warning appears: "SMTP Not Configured"
2. Click "Configure SMTP" button
3. Fill in your email settings:
   - SMTP Host (e.g., smtp.gmail.com)
   - SMTP Port (usually 587)
   - Username (your email)
   - Password (app password)
4. Click "Save Configuration"
5. See green success message

#### Step 5: Send Email Campaign
1. Choose an email template from gallery
2. Preview shows subject and body
3. Review recipient count
4. Click big green "Send Campaign" button
5. Watch live email client:
   - Left: Shows stats (sent/sending/failed)
   - Middle: List of emails going out
   - Right: Preview of each email
6. Each email shows status:
   - ✓ Green = Sent successfully
   - ⏳ Blue = Currently sending
   - ✗ Red = Failed
7. Wait until all complete
8. Auto-redirected to dashboard

#### Step 6: Make Voice Calls (Optional)
1. Click "Voice Calls" step
2. If needed, set up ElevenLabs agent:
   - Click "Configure Voice Agent"
   - Follow the guide
   - Get API key from ElevenLabs
   - Paste it in settings
3. See leads with phone numbers
4. Click "Start Calling" button
5. AI calls each lead automatically
6. Review call logs afterward

#### Step 7: Manage in CRM
1. Click "CRM" in sidebar
2. See all leads organized by stage:
   - New → Called → Texted → Emailed → Qualified → Meeting → Won
3. Click stage tabs to filter
4. Search by name, email, or phone
5. Click buttons on each lead:
   - View - See full details
   - Call - Start a call
   - Email - Send an email
6. Click "Lead Report" to see analytics

---

## Using the Chrome Extension

### Install
1. Go to Chrome Web Store
2. Search "BamLead"
3. Click "Add to Chrome"

### Use
1. Visit any business website
2. Click BamLead icon in toolbar
3. See three options:
   - 🔍 Extract Contact Info - Find emails/phones on page
   - 📊 Analyze Website - Check platform and issues
   - 💾 Save as Lead - Save to your account
4. Click "Send to BamLead" to open dashboard
5. Lead data auto-fills

---

## Tips for Best Results

### 🔥 For Best Lead Quality:
- Use specific business types ("emergency plumbers" not just "plumbers")
- Include city name in location
- Try both search methods to compare results

### 📧 For Best Email Delivery:
- Use a professional SMTP provider (Gmail, SendGrid, etc.)
- Don't send more than 100 emails per day initially
- Personalize your templates
- Monitor deliverability

### 📞 For Best Call Results:
- Set up voice agent with clear script
- Call hot leads within 24 hours
- Review transcripts to improve approach
- Follow up via email after calls

### 💼 For CRM Success:
- Move leads through stages regularly
- Add notes after each interaction
- Set follow-up reminders
- Focus on high-priority leads first

---

## Common Questions

### Q: I don't see any leads after searching?
**A:** Try a broader search term or different location. Also check if you have credits remaining.

### Q: Emails aren't sending?
**A:** Check SMTP configuration in Settings. Make sure credentials are correct and 2-factor app password is used for Gmail.

### Q: Can I import my existing leads?
**A:** Yes! Use the "Add Lead" button in CRM or import CSV.

### Q: How do I cancel my subscription?
**A:** Go to Settings → Subscription → "Manage Subscription"

### Q: Is my data secure?
**A:** Yes! All data is encrypted and stored securely. We never share your data.

---

## Support

### Need Help?
- 📧 Email: support@bamlead.com
- 💬 Live Chat: Click support widget on dashboard
- 📚 Documentation: bamlead.com/docs
- 🎥 Video Tutorials: bamlead.com/tutorials

---

## Next Steps After Setup

1. ✅ Complete first lead search
2. ✅ Send first email campaign
3. ✅ Set up voice calling
4. ✅ Explore CRM features
5. ✅ Install Chrome extension
6. ✅ Share referral link (earn 35% commission!)

**You're all set! Start finding leads and growing your business! 🚀**
