# BamLead Chrome Extension

A Chrome extension for lead prospecting that allows you to extract contact information from any website and save leads directly to your BamLead account.

## Features

- 🔍 **Extract Contact Info**: Automatically find emails, phone numbers, and social links on any webpage
- 📊 **Website Analysis**: Detect the platform (WordPress, Shopify, Wix, etc.) and analyze SEO/mobile optimization
- 💾 **Save Leads Locally**: Store leads in the extension for later use
- 🚀 **Send to BamLead**: One-click export to your BamLead dashboard
- 🖱️ **Right-Click Menu**: Quick access via context menu
- ✨ **Highlight Contacts**: Visual highlighting of contact information on pages

## Installation

### Development / Testing

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `chrome-extension` folder from this repository
5. The extension icon should appear in your toolbar

### Creating Icons

Before loading the extension, create icon files in the `icons/` folder:
- `icon16.png` (16x16 pixels)
- `icon32.png` (32x32 pixels)  
- `icon48.png` (48x48 pixels)
- `icon128.png` (128x128 pixels)

You can use the BamLead logo or create a simple target/crosshair icon.

## Usage

### Popup Interface

1. Click the BamLead icon in your Chrome toolbar
2. The popup shows the current page URL
3. Click "Extract Contact Info" to scan the page
4. Review extracted data (emails, phones, social links)
5. Click "Save as Lead" to store locally
6. Click "Send to BamLead" to open the dashboard with the data

### Context Menu (Right-Click)

- **Extract contact info**: Scans current page
- **Save as lead to BamLead**: Quick save
- **Add email to BamLead**: Highlight text containing an email and right-click

### Keyboard Shortcuts (Coming Soon)

- `Alt+B`: Open popup
- `Alt+E`: Extract contacts from current page
- `Alt+S`: Save current page as lead

## Permissions

The extension requires:
- `activeTab`: Access current tab content
- `storage`: Save leads locally
- `contextMenus`: Add right-click options

## Data Privacy

- All lead data is stored locally in Chrome storage
- Data is only sent to BamLead when you click "Send to BamLead"
- No data is collected or transmitted to third parties

## Building for Production

1. Update version in `manifest.json`
2. Remove any console.log statements
3. Create a ZIP file of the `chrome-extension` folder
4. Upload to Chrome Web Store (requires developer account)

## Troubleshooting

**Extension not working on a page?**
- Some pages block content scripts (e.g., Chrome Web Store, chrome:// pages)
- Try refreshing the page after installing

**No contacts found?**
- The page may not have visible contact information
- Contact info in images or PDFs cannot be extracted

**"Send to BamLead" not working?**
- Ensure you're logged into BamLead in another tab
- Check that bamlead.com is accessible

## Support

For issues or feature requests, contact support@bamlead.com or open an issue on GitHub.
