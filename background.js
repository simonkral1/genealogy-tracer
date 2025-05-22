chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.sendMessage(tab.id, {action: "getSelectedText"}, (response) => {
    if (response && response.selectedText) {
      const selectedText = response.selectedText;
      console.log("Selected Text:" , selectedText);
      
      // Replace YOUR_CLOUDFLARE_WORKER_URL_HERE with your actual Cloudflare Worker URL
      const workerUrl = 'https://red-heart-d66e.simon-kral99.workers.dev/trace';
      
      fetch(workerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain'
        },
        body: selectedText
      })
      .then(response => response.text())
      .then(data => {
        console.log('Response from worker:', data);
        // TODO: Handle the response from the worker. 
        // You could display this data in an alert, a popup, or inject it into the page.
        alert('Genealogy Trace Result:

' + data);
      })
      .catch((error) => {
        console.error('Error fetching from worker:', error);
        alert('Error tracing genealogy.');
      });
    } else {
      console.log("No text selected.");
      // TODO: Handle case where no text is selected.
      alert('Please select some text to trace.');
    }
  });
});
