document.addEventListener('DOMContentLoaded', function () {
  const resultsContainer = document.getElementById('results-container');
  const traceOutputDiv = document.getElementById('trace-output');
  const critiqueSectionDiv = document.getElementById('critique-section');
  const critiqueTextP = document.getElementById('critique-text');
  const questionsSectionDiv = document.getElementById('questions-section');
  const questionsListUl = document.getElementById('questions-list');
  const loadingStateDiv = document.getElementById('loading-state');
  const errorStateDiv = document.getElementById('error-state');
  const errorStateP = errorStateDiv.querySelector('p');

  function showLoading(message = 'Loading...') {
    resultsContainer.style.display = 'none';
    errorStateDiv.style.display = 'none';
    loadingStateDiv.style.display = 'block';
    loadingStateDiv.querySelector('p').textContent = message;
  }

  function showError(message) {
    resultsContainer.style.display = 'none';
    loadingStateDiv.style.display = 'none';
    errorStateDiv.style.display = 'block';
    errorStateP.textContent = "Error: " + message;
  }

  function displayData(traceData) {
    traceOutputDiv.innerHTML = ''; // Clear previous items
    critiqueTextP.textContent = ''; // Clear previous
    questionsListUl.innerHTML = ''; // Clear previous questions

    loadingStateDiv.style.display = 'none';
    errorStateDiv.style.display = 'none';
    resultsContainer.style.display = 'block';
    
    // Default to hiding sections, they will be shown if content is present
    traceOutputDiv.style.display = 'none';
    critiqueSectionDiv.style.display = 'none';
    questionsSectionDiv.style.display = 'none';

    const lines = traceData.split('\n');
    let readingCritique = false;
    let readingQuestions = false;
    const itemRegex = /^(.*?)\s\((.*?)\)\s\[\[(.*?)\]\]\s—\s(.*?)$/;
    let hasGenealogyItems = false;

    lines.forEach(line => {
      line = line.trim();
      if (!line) return;

      if (line.toLowerCase().startsWith('critique of genealogy / methodological blind spots:')) {
        const critiqueContent = line.substring(line.indexOf(':') + 1).trim();
        if (critiqueContent) {
            critiqueTextP.textContent = critiqueContent;
            critiqueSectionDiv.style.display = 'block';
        }
        readingCritique = true;
        readingQuestions = false;
        return;
      }
      if (line.toLowerCase().startsWith('open questions:')) {
        readingCritique = false;
        readingQuestions = true;
        // No need to display the section yet, only if there are actual questions
        return;
      }

      if (readingCritique && !readingQuestions) {
        // Append to critique if it spans multiple lines
        if (critiqueTextP.textContent) critiqueTextP.textContent += '\n' + line;
        else critiqueTextP.textContent = line;
        if (critiqueTextP.textContent) critiqueSectionDiv.style.display = 'block';
        return;
      }
      
      if (readingQuestions) {
        if (line.startsWith('-')) {
          const questionText = line.substring(1).trim();
          if (questionText) {
            const li = document.createElement('li');
            li.textContent = questionText;
            questionsListUl.appendChild(li);
            questionsSectionDiv.style.display = 'block';
          }
        }
        return;
      }

      const match = line.match(itemRegex);
      if (match) {
        hasGenealogyItems = true;
        traceOutputDiv.style.display = 'block';
        const [, title, year, url, claim] = match;
        const itemDiv = document.createElement('div');
        itemDiv.className = 'trace-item';
        
        const textContentDiv = document.createElement('div');
        textContentDiv.className = 'trace-item-line';

        const titleStrong = document.createElement('strong');
        titleStrong.textContent = title;
        textContentDiv.appendChild(titleStrong);
        
        const yearSpan = document.createElement('span');
        yearSpan.textContent = ` (${year}) `;
        textContentDiv.appendChild(yearSpan);

        if (url && url.toLowerCase() !== 'n/a' && url.toLowerCase() !== 'none' && url.trim() !== '') {
          const link = document.createElement('a');
          link.href = url.startsWith('http') ? url : '//' + url; // Ensure protocol
          link.textContent = '[source]';
          link.target = '_blank';
          link.rel = 'noopener noreferrer'; // Security best practice
          textContentDiv.appendChild(link);
        }
        
        const claimSpan = document.createElement('span');
        claimSpan.textContent = ` — ${claim}`;
        textContentDiv.appendChild(claimSpan);
        itemDiv.appendChild(textContentDiv);

        const traceButton = document.createElement('button');
        traceButton.textContent = 'Trace this';
        traceButton.className = 'trace-this-button';
        traceButton.dataset.term = title;
        traceButton.addEventListener('click', handleTraceThisClick);
        itemDiv.appendChild(traceButton);
        
        traceOutputDiv.appendChild(itemDiv);
      }
    });

    if (!hasGenealogyItems && traceOutputDiv.style.display !== 'none') {
        // If we thought we had items but didn't parse any, hide or show message
        if (critiqueSectionDiv.style.display === 'none' && questionsSectionDiv.style.display === 'none') {
             traceOutputDiv.innerHTML = '<p>No genealogy items found in the trace.</p>';
             traceOutputDiv.style.display = 'block';
        } else {
            traceOutputDiv.style.display = 'none';
        }
    }
    if (traceOutputDiv.children.length === 0 && critiqueSectionDiv.style.display === 'none' && questionsSectionDiv.style.display === 'none'){
        // If absolutely nothing was parsed or displayed from the trace data
        showError("Could not parse a valid trace from the response.");
    }
  }

  function handleTraceThisClick(event) {
    const term = event.target.dataset.term;
    if (term) {
      showLoading(`Tracing "${term}"...`);
      chrome.runtime.sendMessage({ action: "getTraceForSelectedText", selectedTextOverride: term }, function (response) {
        if (chrome.runtime.lastError) {
          showError("Communication error: " + chrome.runtime.lastError.message);
          return;
        }
        if (response) {
          if (response.error) {
            showError(response.error);
          } else if (response.trace) {
            displayData(response.trace);
          } else {
            showError("Unexpected response for new trace.");
          }
        }
      });
    }
  }

  showLoading('Getting selected text...');
  chrome.runtime.sendMessage({ action: "getTraceForSelectedText" }, function (response) {
    if (chrome.runtime.lastError) {
      showError("Could not communicate with background script: " + chrome.runtime.lastError.message);
      return;
    }
    if (response) {
      if (response.error) {
        showError(response.error);
      } else if (response.trace) {
        displayData(response.trace);
      } else {
        showError("Received an unexpected response from background script.");
      }
    } else {
      showError("No response from background script.");
    }
  });
}); 