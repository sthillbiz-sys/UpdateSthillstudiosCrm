// BamLead Chrome Extension - Background Service Worker
// Version 1.0.1 - Fixed installation and context menu issues

// Create context menu on install
chrome.runtime.onInstalled.addListener(async () => {
  console.log('BamLead extension installing...');
  
  // Initialize storage
  try {
    await chrome.storage.local.set({
      leadsCount: 0,
      todayCount: 0,
      savedLeads: [],
      savedEmails: [],
      lastDate: new Date().toDateString()
    });
    console.log('Storage initialized');
  } catch (e) {
    console.error('Storage init error:', e);
  }

  // Remove existing context menus first to avoid duplicates
  try {
    await chrome.contextMenus.removeAll();
  } catch (e) {
    console.log('No existing menus to remove');
  }

  // Create context menu items
  try {
    chrome.contextMenus.create({
      id: 'bamlead-extract',
      title: '🔍 Extract contact info (BamLead)',
      contexts: ['page']
    });

    chrome.contextMenus.create({
      id: 'bamlead-save',
      title: '💾 Save as lead to BamLead',
      contexts: ['page']
    });

    chrome.contextMenus.create({
      id: 'bamlead-email',
      title: '📧 Add email to BamLead',
      contexts: ['selection']
    });

    console.log('Context menus created');
  } catch (e) {
    console.error('Context menu error:', e);
  }

  console.log('BamLead extension installed successfully!');
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  switch (info.menuItemId) {
    case 'bamlead-extract':
      await extractFromPage(tab);
      break;
    case 'bamlead-save':
      await savePageAsLead(tab);
      break;
    case 'bamlead-email':
      await addSelectedEmail(info.selectionText, tab);
      break;
  }
});

async function extractFromPage(tab) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        // Highlight emails on the page
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
          null,
          false
        );

        let node;
        while (node = walker.nextNode()) {
          const matches = node.textContent.match(emailRegex);
          if (matches) {
            console.log('BamLead found emails:', matches);
          }
        }

        alert('BamLead: Check console for extracted contacts');
      }
    });
  } catch (error) {
    console.error('Extract error:', error);
  }
}

async function savePageAsLead(tab) {
  const lead = {
    url: tab.url,
    title: tab.title,
    savedAt: new Date().toISOString()
  };

  const storage = await chrome.storage.local.get(['savedLeads', 'leadsCount', 'todayCount']);
  const savedLeads = storage.savedLeads || [];
  savedLeads.push(lead);

  await chrome.storage.local.set({
    savedLeads,
    leadsCount: (storage.leadsCount || 0) + 1,
    todayCount: (storage.todayCount || 0) + 1
  });

  // Show notification
  chrome.action.setBadgeText({ text: '✓' });
  chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
  
  setTimeout(() => {
    chrome.action.setBadgeText({ text: '' });
  }, 2000);
}

async function addSelectedEmail(email, tab) {
  if (!email || !email.includes('@')) {
    console.log('Invalid email selection');
    return;
  }

  const storage = await chrome.storage.local.get(['savedEmails']);
  const savedEmails = storage.savedEmails || [];
  
  if (!savedEmails.includes(email.trim())) {
    savedEmails.push(email.trim());
    await chrome.storage.local.set({ savedEmails });
    
    chrome.action.setBadgeText({ text: '+1' });
    chrome.action.setBadgeBackgroundColor({ color: '#14b8a6' });
    
    setTimeout(() => {
      chrome.action.setBadgeText({ text: '' });
    }, 2000);
  }
}

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_STATS') {
    chrome.storage.local.get(['leadsCount', 'todayCount'], (data) => {
      sendResponse(data);
    });
    return true; // Required for async response
  }

  if (message.type === 'SAVE_LEAD') {
    saveLeadToStorage(message.lead).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
});

async function saveLeadToStorage(lead) {
  const storage = await chrome.storage.local.get(['savedLeads', 'leadsCount', 'todayCount']);
  const savedLeads = storage.savedLeads || [];
  savedLeads.push({
    ...lead,
    savedAt: new Date().toISOString()
  });

  await chrome.storage.local.set({
    savedLeads,
    leadsCount: (storage.leadsCount || 0) + 1,
    todayCount: (storage.todayCount || 0) + 1
  });
}
