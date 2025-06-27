console.log("Genealogy Tracer content script loaded and running on this page.");

chrome.runtime.onMessage.addListener(
    function(request, sender, sendResponse) {
        if (request.action === "getSelectedText") {
            const selectedText = window.getSelection().toString();
            sendResponse({selectedText: selectedText});
            return true;
        }
        return false;
    }
);
