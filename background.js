// Listens for messages from the popup.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getTraceForSelectedText") {
    if (request.selectedTextOverride) {
      // If popup sends a specific term to trace (e.g., from a "trace this" button)
      console.log("Background: Received override to trace term:", request.selectedTextOverride);
      processTextAndFetchTrace(request.selectedTextOverride, sendResponse);
    } else {
      // Original flow: Try to get selected text from the active tab
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || tabs.length === 0) {
          sendResponse({ error: "No active tab found." });
          return true; 
        }
        const activeTab = tabs[0];

        if (!activeTab.url || activeTab.url.startsWith('chrome://') || activeTab.url.startsWith('about:')) {
          sendResponse({ error: "Cannot access selected text on this page." });
          // System notification for this case can be helpful as popup might close or not be clear
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: 'Genealogy Tracer Error',
            message: 'Cannot get selected text from the current page (e.g., chrome:// pages, new tab page). Try a regular webpage.'
          });
          return true;
        }
        
        chrome.tabs.sendMessage(activeTab.id, { action: "getSelectedText" }, (responseFromContent) => {
          if (chrome.runtime.lastError) {
            console.error("Error sending message to content script:", chrome.runtime.lastError.message);
            sendResponse({ error: "Could not connect to content script. Try reloading the page. Details: " + chrome.runtime.lastError.message });
            return true; 
          }

          if (responseFromContent && responseFromContent.selectedText && responseFromContent.selectedText.trim() !== '') {
            processTextAndFetchTrace(responseFromContent.selectedText, sendResponse);
          } else {
            sendResponse({ error: "No text selected on the page." });
            // System notification still useful here
            chrome.notifications.create({
              type: 'basic',
              iconUrl: 'icons/icon128.png',
              title: 'Genealogy Tracer',
              message: 'Please select some text on the page to trace.'
            });
          }
        });
      });
    }
    return true; // Crucial for asynchronous sendResponse
  }
  return false;
});

function processTextAndFetchTrace(text, sendResponseCallback) {
  console.log("Background: Processing text:", text);
  const workerUrl = 'https://red-heart-d66e.simon-kral99.workers.dev/trace';
  fetch(workerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: text
  })
  .then(response => {
    if (!response.ok) {
      throw new Error(`Worker responded with status: ${response.status} ${response.statusText}`);
    }
    return response.text();
  })
  .then(data => {
    console.log('Background: Response from worker:', data);
    sendResponseCallback({ trace: data });
  })
  .catch((error) => {
    console.error('Background: Error fetching from worker:', error);
    sendResponseCallback({ error: "Error fetching from worker: " + error.message });
    // System notification for worker errors
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Genealogy Trace Error',
      message: "Failed to get trace from the AI worker: " + error.message
    });
  });
}

// The original chrome.action.onClicked listener is no longer needed if using a popup,
// as the popup opening will trigger the logic in popup.js.
// If you want to keep it as a fallback or for a different action, you can, but it might be confusing.
// For now, I'll comment it out to prioritize the popup flow.

/*
chrome.action.onClicked.addListener((tab) => {
  // This logic is now primarily handled by the popup opening
  // and messaging this background script.
  console.log("Extension icon clicked (old listener) - this should ideally not be the primary flow with a popup.");
  // You could potentially trigger the popup to open here if it wasn't already,
  // or send a message to an open popup, but manifest.default_popup handles opening.
});
*/

console.log("Genealogy Tracer background script loaded.");