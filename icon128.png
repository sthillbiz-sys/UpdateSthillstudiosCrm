// BamLead Chrome Extension - Content Script
// Runs on all pages to enable lead extraction

(function() {
  'use strict';

  // Only initialize once
  if (window.bamLeadInitialized) return;
  window.bamLeadInitialized = true;

  console.log('BamLead content script loaded');

  // Listen for messages from popup or background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'EXTRACT_CONTACTS') {
      const data = extractContactInfo();
      sendResponse(data);
    }

    if (message.type === 'ANALYZE_PAGE') {
      const analysis = analyzePage();
      sendResponse(analysis);
    }

    if (message.type === 'HIGHLIGHT_CONTACTS') {
      highlightContactInfo();
      sendResponse({ success: true });
    }

    return true;
  });

  function extractContactInfo() {
    const data = {
      emails: [],
      phones: [],
      socialLinks: [],
      companyName: '',
      website: window.location.href,
      pageTitle: document.title
    };

    const bodyText = document.body.innerText;
    const html = document.body.innerHTML;

    // Extract emails
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emails = bodyText.match(emailRegex) || [];
    data.emails = [...new Set(emails)]
      .filter(e => !e.includes('.png') && !e.includes('.jpg') && !e.includes('.gif'))
      .slice(0, 10);

    // Extract phone numbers (US format)
    const phoneRegex = /(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/g;
    const phones = bodyText.match(phoneRegex) || [];
    data.phones = [...new Set(phones)].slice(0, 5);

    // Extract social media links
    const socialPatterns = {
      linkedin: /https?:\/\/(www\.)?linkedin\.com\/(?:company|in)\/[^\s"'<>)]+/gi,
      twitter: /https?:\/\/(www\.)?(twitter|x)\.com\/[^\s"'<>)]+/gi,
      facebook: /https?:\/\/(www\.)?facebook\.com\/[^\s"'<>)]+/gi,
      instagram: /https?:\/\/(www\.)?instagram\.com\/[^\s"'<>)]+/gi
    };

    Object.entries(socialPatterns).forEach(([platform, pattern]) => {
      const matches = html.match(pattern) || [];
      matches.slice(0, 2).forEach(url => {
        data.socialLinks.push({ platform, url: url.replace(/[)"'].*$/, '') });
      });
    });

    // Get company name
    const ogSiteName = document.querySelector('meta[property="og:site_name"]');
    const ogTitle = document.querySelector('meta[property="og:title"]');
    const schemaOrg = document.querySelector('script[type="application/ld+json"]');

    if (ogSiteName) {
      data.companyName = ogSiteName.content;
    } else if (ogTitle) {
      data.companyName = ogTitle.content.split('|')[0].split('-')[0].trim();
    } else if (schemaOrg) {
      try {
        const schema = JSON.parse(schemaOrg.textContent);
        data.companyName = schema.name || schema.organization?.name || '';
      } catch (e) {}
    } else {
      data.companyName = document.title.split('|')[0].split('-')[0].trim();
    }

    // Try to find address
    const addressPatterns = [
      /\d{1,5}\s[\w\s]+(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|court|ct)[,.\s]+[\w\s]+,?\s*[A-Z]{2}\s*\d{5}/gi
    ];

    addressPatterns.forEach(pattern => {
      const matches = bodyText.match(pattern);
      if (matches && matches.length > 0) {
        data.address = matches[0];
      }
    });

    return data;
  }

  function analyzePage() {
    const analysis = {
      platform: detectPlatform(),
      hasSSL: window.location.protocol === 'https:',
      hasMobileOptimization: !!document.querySelector('meta[name="viewport"]'),
      hasAnalytics: detectAnalytics(),
      loadTime: getLoadTime(),
      seoScore: calculateSEOScore(),
      issues: []
    };

    // Identify issues
    if (!analysis.hasSSL) {
      analysis.issues.push('Missing SSL certificate');
    }
    if (!analysis.hasMobileOptimization) {
      analysis.issues.push('Not mobile optimized');
    }
    if (analysis.loadTime > 3000) {
      analysis.issues.push('Slow page load time');
    }
    if (analysis.seoScore < 50) {
      analysis.issues.push('Poor SEO optimization');
    }

    return analysis;
  }

  function detectPlatform() {
    const html = document.documentElement.outerHTML.toLowerCase();
    const indicators = {
      'WordPress': ['wp-content', 'wp-includes', 'wordpress'],
      'Shopify': ['shopify', 'cdn.shopify.com'],
      'Wix': ['wix.com', 'wixsite.com', '_wix'],
      'Squarespace': ['squarespace', 'static1.squarespace'],
      'Webflow': ['webflow', 'assets.website-files.com'],
      'Joomla': ['joomla', '/components/com_'],
      'Drupal': ['drupal', 'sites/default/files'],
      'Magento': ['magento', 'mage/cookies'],
      'GoDaddy': ['godaddy', 'secureserver.net'],
      'Weebly': ['weebly', 'weeblycloud.com']
    };

    for (const [platform, patterns] of Object.entries(indicators)) {
      if (patterns.some(p => html.includes(p))) {
        return platform;
      }
    }

    return 'Custom/Unknown';
  }

  function detectAnalytics() {
    const html = document.documentElement.outerHTML;
    return {
      googleAnalytics: html.includes('google-analytics.com') || html.includes('gtag') || html.includes('ga.js'),
      facebookPixel: html.includes('facebook.com/tr') || html.includes('fbq('),
      hotjar: html.includes('hotjar.com'),
      mixpanel: html.includes('mixpanel.com')
    };
  }

  function getLoadTime() {
    if (performance.timing) {
      return performance.timing.loadEventEnd - performance.timing.navigationStart;
    }
    return 0;
  }

  function calculateSEOScore() {
    let score = 0;
    const maxScore = 100;

    // Title tag
    const title = document.querySelector('title');
    if (title && title.textContent.length > 10 && title.textContent.length < 60) {
      score += 15;
    }

    // Meta description
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc && metaDesc.content.length > 50 && metaDesc.content.length < 160) {
      score += 15;
    }

    // H1 tag
    const h1 = document.querySelector('h1');
    if (h1) {
      score += 10;
    }

    // Alt tags on images
    const images = document.querySelectorAll('img');
    const imagesWithAlt = document.querySelectorAll('img[alt]:not([alt=""])');
    if (images.length > 0) {
      score += Math.round((imagesWithAlt.length / images.length) * 15);
    } else {
      score += 15;
    }

    // SSL
    if (window.location.protocol === 'https:') {
      score += 15;
    }

    // Mobile viewport
    if (document.querySelector('meta[name="viewport"]')) {
      score += 10;
    }

    // Canonical URL
    if (document.querySelector('link[rel="canonical"]')) {
      score += 10;
    }

    // Open Graph tags
    if (document.querySelector('meta[property="og:title"]')) {
      score += 10;
    }

    return Math.min(score, maxScore);
  }

  function highlightContactInfo() {
    const style = document.createElement('style');
    style.textContent = `
      .bamlead-highlight {
        background: linear-gradient(135deg, rgba(20, 184, 166, 0.3) 0%, rgba(13, 148, 136, 0.3) 100%) !important;
        border-radius: 2px;
        padding: 1px 3px;
        transition: all 0.3s ease;
      }
      .bamlead-highlight:hover {
        background: linear-gradient(135deg, rgba(20, 184, 166, 0.5) 0%, rgba(13, 148, 136, 0.5) 100%) !important;
        cursor: pointer;
      }
    `;
    document.head.appendChild(style);

    // Highlight emails
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    highlightMatches(emailRegex);

    // Highlight phone numbers
    const phoneRegex = /(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/g;
    highlightMatches(phoneRegex);
  }

  function highlightMatches(regex) {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    const nodesToProcess = [];
    let node;
    
    while (node = walker.nextNode()) {
      if (regex.test(node.textContent)) {
        nodesToProcess.push(node);
      }
      regex.lastIndex = 0;
    }

    nodesToProcess.forEach(textNode => {
      const text = textNode.textContent;
      const fragment = document.createDocumentFragment();
      let lastIndex = 0;
      let match;

      regex.lastIndex = 0;
      while ((match = regex.exec(text)) !== null) {
        // Add text before match
        if (match.index > lastIndex) {
          fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
        }

        // Add highlighted match
        const span = document.createElement('span');
        span.className = 'bamlead-highlight';
        span.textContent = match[0];
        span.title = 'Click to copy';
        span.addEventListener('click', (e) => {
          e.preventDefault();
          navigator.clipboard.writeText(match[0]);
          span.style.background = 'rgba(34, 197, 94, 0.5)';
          setTimeout(() => {
            span.style.background = '';
          }, 500);
        });
        fragment.appendChild(span);

        lastIndex = regex.lastIndex;
      }

      // Add remaining text
      if (lastIndex < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
      }

      textNode.parentNode.replaceChild(fragment, textNode);
    });
  }
})();
