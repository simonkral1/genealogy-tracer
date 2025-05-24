// Store selected text temporarily when icon is clicked
let storedSelectedText = null;
let storedTabInfo = null;

// Cache for storing trace responses (24 hour expiration)
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Initialize context menu and setup
chrome.runtime.onInstalled.addListener(() => {
  // Create context menu for selected text
  chrome.contextMenus.create({
    id: "trace-genealogy",
    title: "Trace Genealogy of '%s'",
    contexts: ["selection"]
  });
  
  console.log("Genealogy Tracer extension installed and context menu created.");
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "trace-genealogy" && info.selectionText) {
    console.log('Context menu clicked for text:', info.selectionText);
    openTraceWindow(info.selectionText.trim());
  }
});

// Handle keyboard shortcut
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "trace-selected") {
    console.log('Keyboard shortcut activated');
    // Get selected text from the current tab
    chrome.tabs.sendMessage(tab.id, { action: 'getSelectedText' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error getting selected text via shortcut:', chrome.runtime.lastError);
        openTraceWindow(null, 'Could not get selected text: ' + chrome.runtime.lastError.message);
      } else if (response && response.selectedText && response.selectedText.trim()) {
        console.log('Selected text received via shortcut:', response.selectedText);
        openTraceWindow(response.selectedText.trim());
      } else {
        openTraceWindow(null, 'No text selected. Please select some text first.');
      }
    });
  }
});

// Listen for extension icon clicks
chrome.action.onClicked.addListener(async (tab) => {
  console.log('Extension icon clicked on tab:', tab.url);
  
  // First, get selected text from the current tab
  try {
    chrome.tabs.sendMessage(tab.id, { action: 'getSelectedText' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error getting selected text:', chrome.runtime.lastError);
        // Still open the popup but with an error message
        storedSelectedText = null;
        storedTabInfo = { error: 'Could not get selected text: ' + chrome.runtime.lastError.message };
      } else if (response && response.selectedText && response.selectedText.trim()) {
        console.log('Selected text received:', response.selectedText);
        storedSelectedText = response.selectedText;
        storedTabInfo = { tabId: tab.id, tabUrl: tab.url };
      } else {
        console.log('No text selected');
        storedSelectedText = null;
        storedTabInfo = { error: 'No text selected. Please select some text first.' };
      }
      
      // Open the popup window after getting the text
      chrome.windows.create({
        url: chrome.runtime.getURL('popup.html'),
        type: 'popup',
        width: 500,
        height: 600,
        focused: true
      });
    });
  } catch (error) {
    console.error('Error in action click handler:', error);
    storedTabInfo = { error: 'Failed to access page: ' + error.message };
    // Still open popup to show error
    chrome.windows.create({
      url: chrome.runtime.getURL('popup.html'),
      type: 'popup',
      width: 500,
      height: 600,
      focused: true
    });
  }
});

// Helper function to open trace window with text
function openTraceWindow(selectedText, errorMessage = null) {
  if (errorMessage) {
    storedSelectedText = null;
    storedTabInfo = { error: errorMessage };
  } else if (selectedText) {
    storedSelectedText = selectedText;
    storedTabInfo = { directText: true };
  } else {
    storedSelectedText = null;
    storedTabInfo = { error: 'No text provided for tracing.' };
  }
  
  chrome.windows.create({
    url: chrome.runtime.getURL('popup.html'),
    type: 'popup',
    width: 500,
    height: 600,
    focused: true
  });
}

// Cache management functions
async function getCachedResponse(text) {
  const cacheKey = `trace_${text.toLowerCase().trim()}`;
  try {
    const result = await chrome.storage.local.get([cacheKey]);
    if (result[cacheKey]) {
      const cachedData = result[cacheKey];
      const now = Date.now();
      
      // Check if cache is still valid (24 hours)
      if (now - cachedData.timestamp < CACHE_DURATION) {
        console.log('Using cached response for:', text);
        return cachedData.response;
      } else {
        // Remove expired cache
        chrome.storage.local.remove([cacheKey]);
        console.log('Cache expired for:', text);
      }
    }
  } catch (error) {
    console.error('Error reading cache:', error);
  }
  return null;
}

async function setCachedResponse(text, response) {
  const cacheKey = `trace_${text.toLowerCase().trim()}`;
  const cachedData = {
    response: response,
    timestamp: Date.now(),
    originalText: text
  };
  
  try {
    await chrome.storage.local.set({ [cacheKey]: cachedData });
    console.log('Cached response for:', text);
  } catch (error) {
    console.error('Error caching response:', error);
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received message:', request);

  if (request.action === 'getTraceForSelectedText') {
    // Use selectedTextOverride if provided (for "trace this" functionality)
    const textToTrace = request.selectedTextOverride;
    
    if (textToTrace) {
      // Direct trace without getting selected text
      console.log('Tracing provided text:', textToTrace);
      performTrace(textToTrace, sendResponse);
    } else {
      // Use stored selected text from when icon was clicked
      if (storedTabInfo && storedTabInfo.error) {
        sendResponse({ error: storedTabInfo.error });
        return;
      }
      
      if (storedSelectedText) {
        console.log('Using stored selected text:', storedSelectedText);
        performTrace(storedSelectedText, sendResponse);
      } else {
        sendResponse({ error: 'No text was selected when the extension was opened.' });
      }
    }

    return true; // Keep message channel open for async response
  }
});

async function performTrace(selectedText, sendResponse) {
  try {
    console.log('Sending to worker:', selectedText);
    
    // Check cache first
    const cachedResponse = await getCachedResponse(selectedText);
    if (cachedResponse) {
      sendResponse({ trace: cachedResponse, fromCache: true });
      return;
    }
    
    const response = await fetch('https://red-heart-d66e.simon-kral99.workers.dev/trace', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: selectedText
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Worker error:', response.status, errorText);
      sendResponse({ error: `Worker returned error ${response.status}: ${errorText}` });
      return;
    }

    const traceText = await response.text();
    console.log('Worker response received');
    
    // Cache the response
    await setCachedResponse(selectedText, traceText);
    
    sendResponse({ trace: traceText, fromCache: false });

  } catch (error) {
    console.error('Network error:', error);
    sendResponse({ error: 'Network error: ' + error.message });
  }
}

console.log("Genealogy Tracer background script loaded.");