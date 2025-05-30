document.addEventListener('DOMContentLoaded', function () {
  const resultsContainer = document.getElementById('results-container');
  const traceOutputDiv = document.getElementById('trace-output');
  const questionsSectionDiv = document.getElementById('questions-section');
  const questionsListUl = document.getElementById('questions-list');
  const loadingStateDiv = document.getElementById('loading-state');
  const errorStateDiv = document.getElementById('error-state');
  const errorStateP = errorStateDiv.querySelector('p');

  // Cache functions (moved from background script)
  const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

  async function getCachedResponse(text) {
    const cacheKey = `trace_${text.toLowerCase().trim()}`;
    try {
      const result = await chrome.storage.local.get([cacheKey]);
      if (result[cacheKey]) {
        const cachedData = result[cacheKey];
        const now = Date.now();
        
        if (now - cachedData.timestamp < CACHE_DURATION) {
          console.log('Using cached response for:', text);
          return cachedData.response;
        } else {
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

  // Streaming state
  let streamingActive = false;
  let streamedItems = [];
  let streamedQuestions = [];

  function showLoading(message = 'Loading...') {
    // Don't hide results container if streaming is active
    if (!streamingActive) {
      resultsContainer.style.display = 'none';
    }
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

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
      const originalText = event.target.textContent;
      event.target.textContent = 'Copied!';
      event.target.style.backgroundColor = '#48bb78';
      setTimeout(() => {
        event.target.textContent = originalText;
        event.target.style.backgroundColor = '';
      }, 1000);
    }).catch(err => {
      console.error('Failed to copy: ', err);
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    });
  }

  function initializeStreaming(fromCache = false) {
    streamingActive = true;
    streamedItems = [];
    streamedQuestions = [];
    
    traceOutputDiv.innerHTML = '';
    questionsListUl.innerHTML = '';
    
    loadingStateDiv.style.display = 'none';
    errorStateDiv.style.display = 'none';
    resultsContainer.style.display = 'block';
    
    if (fromCache) {
      const cacheIndicator = document.createElement('div');
      cacheIndicator.className = 'cache-indicator';
      cacheIndicator.innerHTML = '⚡ Loaded from cache (instant!)';
      traceOutputDiv.appendChild(cacheIndicator);
    }
    
    traceOutputDiv.style.display = 'block';
    questionsSectionDiv.style.display = 'none';
  }

  function addGenealogyItem(item) {
    // Hide loading status once first item appears
    loadingStateDiv.style.display = 'none';
    
    const itemDiv = document.createElement('div');
    itemDiv.className = 'trace-item';
    itemDiv.style.opacity = '0';
    itemDiv.style.transform = 'translateY(10px)';
    
    const textContentDiv = document.createElement('div');
    textContentDiv.className = 'trace-item-line';

    const titleStrong = document.createElement('strong');
    titleStrong.textContent = item.title;
    textContentDiv.appendChild(titleStrong);
    
    const yearSpan = document.createElement('span');
    yearSpan.textContent = ` (${item.year}) `;
    textContentDiv.appendChild(yearSpan);

    if (item.url && item.url.toLowerCase() !== 'n/a' && item.url.toLowerCase() !== 'none' && item.url.trim() !== '') {
      const link = document.createElement('a');
      link.href = item.url.startsWith('http') ? item.url : '//' + item.url;
      link.textContent = '[source]';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      textContentDiv.appendChild(link);
    }
    
    const claimSpan = document.createElement('span');
    claimSpan.textContent = ` — ${item.claim}`;
    textContentDiv.appendChild(claimSpan);
    itemDiv.appendChild(textContentDiv);

    const traceButton = document.createElement('button');
    traceButton.textContent = 'Trace this';
    traceButton.className = 'trace-this-button';
    traceButton.dataset.term = item.title;
    traceButton.addEventListener('click', () => performDirectTrace(item.title));
    itemDiv.appendChild(traceButton);
    
    const copyAllContainer = traceOutputDiv.querySelector('.copy-all-container');
    if (copyAllContainer) {
      traceOutputDiv.insertBefore(itemDiv, copyAllContainer);
    } else {
      traceOutputDiv.appendChild(itemDiv);
    }
    
    setTimeout(() => {
      itemDiv.style.transition = 'opacity 0.3s, transform 0.3s';
      itemDiv.style.opacity = '1';
      itemDiv.style.transform = 'translateY(0)';
    }, 10);
    
    streamedItems.push(item);
  }

  function showQuestionsSection() {
    questionsSectionDiv.style.display = 'block';
  }

  function addQuestion(questionText) {
    const li = document.createElement('li');
    li.textContent = questionText;
    li.style.opacity = '0';
    questionsListUl.appendChild(li);
    
    setTimeout(() => {
      li.style.transition = 'opacity 0.3s';
      li.style.opacity = '1';
    }, 10);
    
    streamedQuestions.push(questionText);
  }

  function completeStreaming() {
    streamingActive = false;
    
    if (streamedItems.length > 0 || streamedQuestions.length > 0) {
      const copyAllContainer = document.createElement('div');
      copyAllContainer.className = 'copy-all-container';
      
      let allTraceText = streamedItems.map(item => 
        `${item.title} (${item.year}) [${item.url}] — ${item.claim}`
      ).join('\n');
      
      if (streamedQuestions.length > 0) {
        allTraceText += '\n\nOpen Questions:\n' + streamedQuestions.map(q => `- ${q}`).join('\n');
      }
      
      const copyAllBtn = document.createElement('button');
      copyAllBtn.textContent = 'Copy All';
      copyAllBtn.className = 'copy-all-button';
      copyAllBtn.addEventListener('click', () => copyToClipboard(allTraceText));
      copyAllContainer.appendChild(copyAllBtn);

      const graphViewBtn = document.createElement('button');
      graphViewBtn.textContent = 'Graph View';
      graphViewBtn.className = 'graph-view-button';
      graphViewBtn.addEventListener('click', () => openGraphView());
      copyAllContainer.appendChild(graphViewBtn);
      
      traceOutputDiv.appendChild(copyAllContainer);

      // Cache the complete response
      const fullTrace = allTraceText;
      if (currentTraceText) {
        setCachedResponse(currentTraceText, fullTrace);
      }
    }
  }

  let currentTraceText = null;
  let graphViewWindowId = null;

  function openGraphView() {
    // Use streaming data if available, otherwise use cached data
    const items = streamedItems.length > 0 ? streamedItems : parseCachedItems();
    const questions = streamedQuestions.length > 0 ? streamedQuestions : parseCachedQuestions();
    
    const graphData = {
      nodes: [],
      links: [],
      rootTerm: currentTraceText,
      items: items,
      questions: questions
    };

    console.log('Preparing graph data:', graphData);
    console.log('Current trace text:', currentTraceText);
    console.log('Streamed items:', streamedItems);
    console.log('Parsed items:', items);

    // Store graph data for the new popup
    chrome.storage.local.set({ 
      'graphViewData': graphData,
      'graphViewTimestamp': Date.now()
    }).then(() => {
      console.log('Graph data stored successfully');
      // Verify storage
      chrome.storage.local.get(['graphViewData']).then(result => {
        console.log('Verified stored data:', result);
      });
      
      // Close previous graph view window if it exists
      if (graphViewWindowId) {
        chrome.windows.remove(graphViewWindowId).catch(error => {
          console.log('Previous graph window already closed or not found:', error);
        });
      }
      
      // Open graph view popup
      chrome.windows.create({
        url: chrome.runtime.getURL('graph-view.html'),
        type: 'popup',
        width: 900,
        height: 700,
        focused: true
      }).then(window => {
        // Store the new window ID
        graphViewWindowId = window.id;
        console.log('Graph view window opened with ID:', graphViewWindowId);
      });
    }).catch(error => {
      console.error('Failed to store graph data:', error);
    });
  }

  function parseCachedItems() {
    // Parse genealogy items from the current UI
    const items = [];
    const traceItems = document.querySelectorAll('.trace-item');
    
    traceItems.forEach(itemDiv => {
      const strong = itemDiv.querySelector('strong');
      const spans = itemDiv.querySelectorAll('span');
      const link = itemDiv.querySelector('a');
      
      if (strong && spans.length >= 2) {
        const title = strong.textContent;
        const yearText = spans[0].textContent.trim();
        const year = yearText.match(/\(([^)]+)\)/) ? yearText.match(/\(([^)]+)\)/)[1] : '';
        const claim = spans[spans.length - 1].textContent.replace(/^—\s*/, '');
        const url = link ? link.href : 'N/A';
        
        items.push({ title, year, claim, url });
      }
    });
    
    return items;
  }

  function parseCachedQuestions() {
    // Parse questions from the current UI
    const questions = [];
    const questionItems = document.querySelectorAll('#questions-list li');
    
    questionItems.forEach(li => {
      questions.push(li.textContent);
    });
    
    return questions;
  }

  async function performDirectTrace(selectedText) {
    currentTraceText = selectedText;
    console.log('Starting trace for:', selectedText);
    
    // Check cache first
    const cachedResponse = await getCachedResponse(selectedText);
    if (cachedResponse) {
      displayData(cachedResponse, true);
      return;
    }
    
    try {
      initializeStreaming();
      
      const response = await fetch('https://red-heart-d66e.simon-kral99.workers.dev/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: selectedText
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Worker error:', response.status, errorText);
        showError(`Worker returned error ${response.status}: ${errorText}`);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) break;
          
          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;
          
          // Process complete lines only
          const lines = buffer.split('\n');
          buffer = lines.pop(); // Keep incomplete line in buffer
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const jsonStr = line.slice(6);
                if (jsonStr.trim() === '') continue;
                
                const data = JSON.parse(jsonStr);
                
                switch (data.type) {
                  case 'status':
                    showLoading(data.message);
                    break;
                    
                  case 'genealogy_item':
                    addGenealogyItem(data);
                    break;
                    
                  case 'section':
                    if (data.section === 'questions') {
                      showQuestionsSection();
                    }
                    break;
                    
                  case 'question':
                    addQuestion(data.text);
                    break;
                    
                  case 'complete':
                    completeStreaming();
                    return;
                    
                  case 'error':
                    showError(data.message);
                    return;
                }
              } catch (parseError) {
                console.error('Error parsing stream data:', parseError, 'Line:', line);
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

    } catch (error) {
      console.error('Streaming error:', error);
      showError('Streaming error: ' + error.message);
    }
  }

  function displayData(traceData, fromCache = false) {
    traceOutputDiv.innerHTML = '';
    questionsListUl.innerHTML = '';

    loadingStateDiv.style.display = 'none';
    errorStateDiv.style.display = 'none';
    resultsContainer.style.display = 'block';
    
    if (fromCache) {
      const cacheIndicator = document.createElement('div');
      cacheIndicator.className = 'cache-indicator';
      cacheIndicator.innerHTML = '⚡ Loaded from cache (instant!)';
      traceOutputDiv.appendChild(cacheIndicator);
    }
    
    // Don't hide these initially - show them as we find content
    questionsSectionDiv.style.display = 'none';

    const lines = traceData.split('\n');
    let readingQuestions = false;
    // Updated regex to match the format: "Title (Year) [[URL]] — Claim"
    const itemRegex = /^(.*?)\s\(([^)]+)\)\s\[\[([^\]]+)\]\]\s—\s(.+)$/;
    let hasGenealogyItems = false;
    let allTraceText = '';

    lines.forEach(line => {
      line = line.trim();
      if (!line) return;

      if (line.startsWith('--- TIMING BREAKDOWN ---')) {
        readingQuestions = false;
        return;
      }

      if (line.toLowerCase().startsWith('open questions:')) {
        readingQuestions = true;
        allTraceText += line + '\n';
        return;
      }

      if (readingQuestions) {
        if (line.startsWith('-')) {
          const questionText = line.substring(1).trim();
          if (questionText) {
            allTraceText += '- ' + questionText + '\n';
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
        const [, title, year, url, claim] = match;
        
        allTraceText += `${title} (${year}) [${url}] — ${claim}\n`;
        
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
          link.href = url.startsWith('http') ? url : '//' + url;
          link.textContent = '[source]';
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
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
        traceButton.addEventListener('click', () => performDirectTrace(title));
        itemDiv.appendChild(traceButton);
        
        traceOutputDiv.appendChild(itemDiv);
      }
    });

    // Show genealogy section if we have items
    if (hasGenealogyItems) {
      traceOutputDiv.style.display = 'block';
    }

    if (hasGenealogyItems || questionsSectionDiv.style.display !== 'none') {
      const copyAllContainer = document.createElement('div');
      copyAllContainer.className = 'copy-all-container';
      
      const copyAllBtn = document.createElement('button');
      copyAllBtn.textContent = 'Copy All';
      copyAllBtn.className = 'copy-all-button';
      copyAllBtn.addEventListener('click', () => copyToClipboard(allTraceText));
      copyAllContainer.appendChild(copyAllBtn);

      const graphViewBtn = document.createElement('button');
      graphViewBtn.textContent = 'Graph View';
      graphViewBtn.className = 'graph-view-button';
      graphViewBtn.addEventListener('click', () => openGraphView());
      copyAllContainer.appendChild(graphViewBtn);
      
      traceOutputDiv.appendChild(copyAllContainer);
    }

    if (!hasGenealogyItems && questionsSectionDiv.style.display === 'none') {
      showError("Could not parse a valid trace from the response.");
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
        // Set currentTraceText from response if available
        if (response.selectedText) {
          currentTraceText = response.selectedText;
        }
        displayData(response.trace, response.fromCache);
      } else if (response.selectedText) {
        // Direct streaming with selected text
        performDirectTrace(response.selectedText);
      } else {
        showError("Received an unexpected response from background script.");
      }
    } else {
      showError("No response from background script.");
    }
  });
}); 