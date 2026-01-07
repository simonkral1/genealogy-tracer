document.addEventListener('DOMContentLoaded', function () {
  const resultsContainer = document.getElementById('results-container');
  const traceOutputDiv = document.getElementById('trace-output');
  const questionsSectionDiv = document.getElementById('questions-section');
  const questionsListUl = document.getElementById('questions-list');
  const loadingStateDiv = document.getElementById('loading-state');
  const errorStateDiv = document.getElementById('error-state');
  const errorStateP = errorStateDiv.querySelector('p');
  const modelSelect = document.getElementById('model-select');
  const hyperbolicKeyInput = document.getElementById('hyperbolic-key-input');

  const MODEL_STORAGE_KEY = 'ct_selected_model';
  const HYPER_KEY_STORAGE_KEY = 'ct_hyperbolic_key';
  const DEFAULT_MODEL = 'claude-opus-4-5-20251101';

  function getSelectedModel() {
    return (modelSelect && modelSelect.value) || DEFAULT_MODEL;
  }

  function initModelPicker() {
    if (!modelSelect) return;

    chrome.storage.local.get([MODEL_STORAGE_KEY], (result) => {
      const saved = result[MODEL_STORAGE_KEY];
      if (saved && modelSelect.querySelector(`option[value="${saved}"]`)) {
        modelSelect.value = saved;
      }
    });

    modelSelect.addEventListener('change', () => {
      const selected = getSelectedModel();
      chrome.storage.local.set({ [MODEL_STORAGE_KEY]: selected });
    });
  }

  initModelPicker();

  function getHyperbolicKey() {
    return hyperbolicKeyInput && hyperbolicKeyInput instanceof HTMLInputElement
      ? hyperbolicKeyInput.value.trim()
      : '';
  }

  function initHyperbolicKey() {
    if (!hyperbolicKeyInput || !(hyperbolicKeyInput instanceof HTMLInputElement)) return;

    chrome.storage.local.get([HYPER_KEY_STORAGE_KEY], (result) => {
      const saved = result[HYPER_KEY_STORAGE_KEY];
      if (typeof saved === 'string') {
        hyperbolicKeyInput.value = saved;
      }
    });

    hyperbolicKeyInput.addEventListener('change', () => {
      const val = getHyperbolicKey();
      if (val) {
        chrome.storage.local.set({ [HYPER_KEY_STORAGE_KEY]: val });
      } else {
        chrome.storage.local.remove([HYPER_KEY_STORAGE_KEY]);
      }
    });
  }

  initHyperbolicKey();

  const questionsHeader = document.getElementById('questions-header');
  const questionsContent = document.getElementById('questions-content');
  const timeline = document.getElementById('timeline');

  // Cache functions (moved from background script)
  const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

  async function getCachedResponse(text) {
    const cacheKey = `trace_${text.toLowerCase().trim()}_${getSelectedModel()}`;
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
    const cacheKey = `trace_${text.toLowerCase().trim()}_${getSelectedModel()}`;
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
  let traceStats = {
    itemCount: 0,
    questionCount: 0,
    earliestYear: null,
    latestYear: null
  };

  // Scholarly loading phrases inspired by Library of Babel
  const scholarlyPhrases = [
    'examining the archives',
    'scouring the libraries',
    'consulting the catalogue',
    'perusing manuscripts',
    'investigating the stacks',
    'surveying bibliographies',
    'reviewing the indices',
    'searching the collection'
  ];
  
  let currentPhraseIndex = 0;

  // New helper functions for XSS protection and URL validation
  function sanitizeText(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function createSafeUrl(url) {
    try {
      const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
      return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : null;
    } catch {
      return null;
    }
  }

  function showLoading(message = null, showProgress = true) {
    // Don't hide results container if streaming is active
    if (!streamingActive) {
      resultsContainer.style.display = 'none';
    }
    errorStateDiv.style.display = 'none';
    loadingStateDiv.style.display = 'block';
    
    // Use provided message or cycle through scholarly phrases
    let displayMessage = message;
    if (!message) {
      displayMessage = scholarlyPhrases[currentPhraseIndex];
      currentPhraseIndex = (currentPhraseIndex + 1) % scholarlyPhrases.length;
    }
    
    // Update loading message
    const loadingMessage = document.getElementById('loading-message');
    const progressIndicator = document.getElementById('progress-indicator');
    
    if (loadingMessage) {
      // Clear previous content safely and append animated dots
      loadingMessage.textContent = displayMessage;
      const dotsSpan = document.createElement('span');
      dotsSpan.className = 'loading-dots';
      dotsSpan.textContent = '...';
      loadingMessage.appendChild(dotsSpan);
    }
    
    // Show/hide progress indicator
    if (progressIndicator) {
      progressIndicator.style.display = showProgress ? 'block' : 'none';
      if (showProgress) {
        const subPhrases = [
          'consulting references and citations',
          'cross-referencing historical documents',
          'verifying scholarly sources',
          'collating intellectual lineages'
        ];
        const randomSubPhrase = subPhrases[Math.floor(Math.random() * subPhrases.length)];
        progressIndicator.textContent = randomSubPhrase;
      }
    }
  }

  function showError(message) {
    resultsContainer.style.display = 'none';
    loadingStateDiv.style.display = 'none';
    errorStateDiv.style.display = 'block';
    
    // Hide search term display on error
    const searchTermDisplay = document.getElementById('search-term-display');
    if (searchTermDisplay) {
      searchTermDisplay.style.display = 'none';
    }
    
    // Enhanced error messages with user-friendly text
    const friendlyErrors = {
      'Failed to fetch': 'Unable to connect to the service. Please check your internet connection.',
      'NetworkError': 'Network connection failed. Please try again.',
      'AbortError': 'Request timed out. Please try again.',
      'No text selected': 'Please select some text on the page before using the extension.',
      'Worker returned error 429': 'Too many requests. Please wait a moment before trying again.',
      'Worker returned error 500': 'Service temporarily unavailable. Please try again later.'
    };
    
    let displayMessage = message;
    for (const [errorType, friendlyMessage] of Object.entries(friendlyErrors)) {
      if (message.includes(errorType)) {
        displayMessage = friendlyMessage;
        break;
      }
    }
    
    errorStateP.textContent = displayMessage;
  }



  async function fetchExpandedContent(item) {
    console.log('🔥 MAKING EXPAND LLM CALL for:', item.title);
    
    try {
      const response = await fetch('https://red-heart-d66e.simon-kral99.workers.dev/expand', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: item.title,
          year: item.year,
          claim: item.claim,
          model: getSelectedModel(),
          hyperbolicApiKey: getHyperbolicKey() || undefined
        })
      });

      console.log('📡 Expand response status:', response.status);

      if (!response.ok) {
        console.error('❌ Expand API Error:', response.status);
        throw new Error(`Expand service error: ${response.status}`);
      }

      const responseData = await response.json();
      
      if (!responseData.content) {
        console.error('❌ No content in expand response');
        throw new Error('No content received from expand service');
      }

      console.log('✨ Expand response received');
      
      // Extract content from <explanation> tags if present
      const explanationMatch = responseData.content.match(/<explanation>([\s\S]*?)<\/explanation>/);
      const cleanContent = explanationMatch && explanationMatch[1] ? explanationMatch[1].trim() : responseData.content.trim();
      
      return cleanContent;
      
    } catch (error) {
      console.error('💥 Expand call failed:', error);
      return `Error loading expanded analysis: ${error.message}. Please try again.`;
    }
  }

  function addTimelineItem(year, itemIndex) {
    if (!timeline) return;
    
    const timelineItem = document.createElement('div');
    timelineItem.className = 'timeline-item';
    timelineItem.dataset.itemIndex = itemIndex;
    
    const yearSpan = document.createElement('div');
    yearSpan.className = 'timeline-year';
    yearSpan.textContent = year;
    
    timelineItem.appendChild(yearSpan);
    timeline.appendChild(timelineItem);
  }

  function updateTimelinePositions() {
    if (!timeline) return;
    
    // Use requestAnimationFrame for smooth, dynamic updates
    requestAnimationFrame(() => {
      const traceItems = document.querySelectorAll('.trace-item');
      const timelineItems = document.querySelectorAll('.timeline-item');
      const timelineLine = timeline.querySelector('.timeline-line');
      
      if (traceItems.length > 0) {
        // Calculate total height of all trace items
        const totalHeight = Array.from(traceItems).reduce((sum, item) => {
          return sum + item.offsetHeight + 2; // +2 for margin-bottom
        }, 0);
        
        // Update timeline line height
        if (timelineLine) {
          timelineLine.style.height = `${totalHeight - 40}px`;
        }
      }
      
      timelineItems.forEach((timelineItem, index) => {
        if (traceItems[index]) {
          const traceItem = traceItems[index];
          const traceItemHeight = traceItem.offsetHeight;
          
          // Calculate cumulative height more precisely
          const cumulativeHeight = Array.from(traceItems).slice(0, index).reduce((sum, item) => {
            return sum + item.offsetHeight + 2; // +2 for margin-bottom
          }, 0);
          
          // Center the timeline item to the exact middle of the genealogy item
          const centerPosition = cumulativeHeight + (traceItemHeight / 2) - (16 / 2); // 16 is timeline-item height
          timelineItem.style.top = `${centerPosition}px`;
        }
      });
    });
  }

  // Dynamic timeline positioning with ResizeObserver and event listeners
  let timelineUpdateTimeout;
  function scheduleDynamicTimelineUpdate() {
    if (timelineUpdateTimeout) clearTimeout(timelineUpdateTimeout);
    timelineUpdateTimeout = setTimeout(updateTimelinePositions, 16); // ~60fps
  }

  // Set up dynamic timeline positioning
  function initializeDynamicTimeline() {
    // Update on window resize
    window.addEventListener('resize', scheduleDynamicTimelineUpdate);
    
    // Set up ResizeObserver for trace items if supported
    if (window.ResizeObserver) {
      const resizeObserver = new ResizeObserver(scheduleDynamicTimelineUpdate);
      
      // Observe the trace output container
      if (traceOutputDiv) {
        resizeObserver.observe(traceOutputDiv);
      }
      
      // Observe individual trace items as they're added
      const observer = new MutationObserver(() => {
        document.querySelectorAll('.trace-item').forEach(item => {
          resizeObserver.observe(item);
        });
        scheduleDynamicTimelineUpdate();
      });
      
      if (traceOutputDiv) {
        observer.observe(traceOutputDiv, { childList: true, subtree: true });
      }
    }
  }

  function initializeCollapsibleElements() {
    if (questionsHeader) {
      questionsHeader.addEventListener('click', () => {
        const toggleIcon = questionsHeader.querySelector('.toggle-icon');
        const isCollapsed = questionsContent.classList.contains('collapsed');
        
        if (isCollapsed) {
          questionsContent.classList.remove('collapsed');
          toggleIcon.classList.remove('collapsed');
          toggleIcon.textContent = '[−]';
        } else {
          questionsContent.classList.add('collapsed');
          toggleIcon.classList.add('collapsed');
          toggleIcon.textContent = '[+]';
        }
      });
    }
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
      const originalText = event.target.textContent;
      event.target.textContent = 'Copied!';
      event.target.style.backgroundColor = '#888888'; // Changed from green to grey
      event.target.style.color = '#ffffff'; // White text on grey background
      setTimeout(() => {
        event.target.textContent = originalText;
        event.target.style.backgroundColor = '';
        event.target.style.color = '';
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
    
    // Reset stats
    traceStats = {
      itemCount: 0,
      questionCount: 0,
      earliestYear: null,
      latestYear: null
    };
    
    traceOutputDiv.innerHTML = '';
    questionsListUl.innerHTML = '';
    
    // Clear timeline and recreate line
    if (timeline) {
      timeline.innerHTML = '';
      const timelineLine = document.createElement('div');
      timelineLine.className = 'timeline-line';
      timeline.appendChild(timelineLine);
    }
    
    loadingStateDiv.style.display = 'none';
    errorStateDiv.style.display = 'none';
    resultsContainer.style.display = 'block';
    

    
    if (fromCache) {
      const cacheIndicator = document.createElement('div');
      cacheIndicator.className = 'cache-indicator';
      cacheIndicator.textContent = 'retrieved from recent inquiries';
      traceOutputDiv.appendChild(cacheIndicator);
    }
    
    traceOutputDiv.style.display = 'block';
    questionsSectionDiv.style.display = 'none';
    
      // Initialize collapsible elements
  initializeCollapsibleElements();
  
  // Initialize dynamic timeline positioning
  initializeDynamicTimeline();
  }

  function addGenealogyItem(item) {
    // Hide loading status once first item appears
    loadingStateDiv.style.display = 'none';
    
    // Update stats
    traceStats.itemCount++;
    
    // Parse year for stats tracking
    const year = parseInt(item.year);
    if (!isNaN(year)) {
      if (traceStats.earliestYear === null || year < traceStats.earliestYear) {
        traceStats.earliestYear = year;
      }
      if (traceStats.latestYear === null || year > traceStats.latestYear) {
        traceStats.latestYear = year;
      }
    }
    
    const itemDiv = document.createElement('div');
    itemDiv.className = 'trace-item';
    itemDiv.style.opacity = '0';
    itemDiv.style.transform = 'translateY(20px)';
    
    const textContentDiv = document.createElement('div');
    textContentDiv.className = 'trace-item-line';

    const titleStrong = document.createElement('strong');
    titleStrong.textContent = item.title;
    textContentDiv.appendChild(titleStrong);
    
    const yearSpan = document.createElement('span');
    yearSpan.textContent = ` (${item.year}) `;
    textContentDiv.appendChild(yearSpan);

    if (item.url && item.url.toLowerCase() !== 'n/a' && item.url.toLowerCase() !== 'none' && item.url.trim() !== '') {
      const safeUrl = createSafeUrl(item.url);
      if (safeUrl) {
        const link = document.createElement('a');
        link.href = safeUrl;
        link.textContent = '[source]';
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        textContentDiv.appendChild(link);
      }
    }
    
    const claimSpan = document.createElement('span');
    claimSpan.textContent = ` — ${item.claim}`;
    textContentDiv.appendChild(claimSpan);
    itemDiv.appendChild(textContentDiv);

    // Create buttons container
    const buttonsDiv = document.createElement('div');
    buttonsDiv.className = 'item-buttons';
    
    const traceButton = document.createElement('button');
    traceButton.textContent = 'trace';
    traceButton.className = 'trace-this-button';
    traceButton.dataset.term = item.title;
    traceButton.addEventListener('click', () => performDirectTrace(item.title));
    buttonsDiv.appendChild(traceButton);
    
    // Add expand button to all items
    const expandButton = document.createElement('button');
    expandButton.textContent = 'expand';
    expandButton.className = 'expand-button';
    
    // Create expanded content container
    const expandedContent = document.createElement('div');
    expandedContent.className = 'expanded-content';
    expandedContent.textContent = 'Loading expanded analysis...';
    itemDiv.appendChild(expandedContent);
    
    expandButton.addEventListener('click', async () => {
      if (expandedContent.classList.contains('visible')) {
        expandedContent.classList.remove('visible');
        expandButton.textContent = 'expand';
      } else {
        // Show loading and fetch content if not already loaded
        if (expandedContent.textContent === 'Loading expanded analysis...') {
          expandButton.textContent = 'loading...';
          expandButton.disabled = true;
          
          const expandedText = await fetchExpandedContent(item);
          expandedContent.textContent = expandedText;
          
          expandButton.disabled = false;
        }
        
        expandedContent.classList.add('visible');
        expandButton.textContent = 'collapse';
      }
      // Update timeline positions after expand/collapse
      scheduleDynamicTimelineUpdate();
    });
    buttonsDiv.appendChild(expandButton);
    
    itemDiv.appendChild(buttonsDiv);
    
    const copyAllContainer = traceOutputDiv.querySelector('.copy-all-container');
    if (copyAllContainer) {
      traceOutputDiv.insertBefore(itemDiv, copyAllContainer);
    } else {
      traceOutputDiv.appendChild(itemDiv);
    }
    
    resultsContainer.style.display = 'block';
    
    // Animate the item in with staggered delay
    setTimeout(() => {
      itemDiv.style.transition = 'all 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
      itemDiv.style.opacity = '1';
      itemDiv.style.transform = 'translateY(0)';
    }, traceStats.itemCount * 100);
    
    streamedItems.push(item);
    
    // Add timeline item
    addTimelineItem(item.year, traceStats.itemCount);
    
    // Update timeline positions progressively
    scheduleDynamicTimelineUpdate();
  }

  function showQuestionsSection() {
    questionsSectionDiv.style.display = 'block';
  }

  function addQuestion(questionText) {
    // Update stats
    traceStats.questionCount++;
    
    const li = document.createElement('li');
    li.textContent = questionText; // Show full question
    li.style.opacity = '0';
    li.style.transform = 'translateX(-10px)';
    questionsListUl.appendChild(li);
    
    setTimeout(() => {
      li.style.transition = 'all 0.3s ease';
      li.style.opacity = '1';
      li.style.transform = 'translateX(0)';
    }, traceStats.questionCount * 50);
    
    streamedQuestions.push(questionText);
  }

  function completeStreaming() {
    streamingActive = false;
    
    // Hide loading state when streaming completes
    loadingStateDiv.style.display = 'none';
    
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
      copyAllBtn.textContent = 'copy';
      copyAllBtn.className = 'copy-all-button';
      copyAllBtn.addEventListener('click', () => copyToClipboard(allTraceText));
      copyAllContainer.appendChild(copyAllBtn);
      
      // Add reinterpret button
      const reinterpretBtn = document.createElement('button');
      reinterpretBtn.textContent = 'reinterpret';
      reinterpretBtn.className = 'copy-all-button'; // Use same styling as copy button
      reinterpretBtn.addEventListener('click', () => performReinterpret());
      copyAllContainer.appendChild(reinterpretBtn);
      
      traceOutputDiv.appendChild(copyAllContainer);

      // Cache the complete response
      const fullTrace = allTraceText;
      if (currentTraceText) {
        setCachedResponse(currentTraceText, fullTrace);
      }
    }
    

    
    // Update timeline positions after all items are loaded
    scheduleDynamicTimelineUpdate();
  }

  let currentTraceText = null;

  async function performDirectTrace(selectedText) {
    currentTraceText = selectedText;
    console.log('Starting trace for:', selectedText);
    
    // Show search term
    const searchTermDisplay = document.getElementById('search-term-display');
    const searchTermText = document.getElementById('search-term-text');
    if (searchTermDisplay && searchTermText) {
      searchTermText.textContent = `Tracing genealogy of: ${selectedText}`;
      searchTermDisplay.style.display = 'block';
    }
    
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
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: selectedText,
          model: getSelectedModel(),
          hyperbolicApiKey: getHyperbolicKey() || undefined
        })
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
          
          // Process complete SSE events delineated by a blank line ("\n\n")
          let eventEnd;
          while ((eventEnd = buffer.indexOf('\n\n')) !== -1) {
            const rawEvent = buffer.slice(0, eventEnd).trim();
            buffer = buffer.slice(eventEnd + 2);
            if (!rawEvent.startsWith('data:')) continue;
            try {
              const jsonStr = rawEvent.slice(5).trim();
              if (jsonStr === '') continue;
              const data = JSON.parse(jsonStr);
              
              switch (data.type) {
                case 'status':
                  // Map status messages to scholarly phrases
                  const scholarlyPhrases = {
                    'Querying Wikipedia': 'Searching bibliographic databases',
                    'Calling Claude': 'Consulting historical records',
                    'Processing genealogy': 'Tracing intellectual lineages',
                    'Finalizing results': 'Compiling scholarly findings'
                  };
                  const scholarlyMessage = scholarlyPhrases[data.message] || 'Scouring the archives';
                  showLoading(scholarlyMessage, true);
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
              console.error('Error parsing stream data:', parseError, 'Event:', rawEvent);
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

  async function performReinterpret() {
    console.log('Starting reinterpret for:', currentTraceText);
    
    if (!currentTraceText) {
      showError('No previous trace to reinterpret');
      return;
    }
    
    // Get current genealogy items in the format expected by worker
    let existingGenealogy = [];
    if (streamedItems.length > 0) {
      existingGenealogy = streamedItems.map(item => ({
        title: item.title,
        year: item.year,
        claim: item.claim,
        url: item.url
      }));
    }
    
    if (existingGenealogy.length === 0) {
      showError('No genealogy items found to reinterpret');
      return;
    }
    
    // Clear current results and reinitialize
    initializeStreaming();
    
    try {
      const response = await fetch('https://red-heart-d66e.simon-kral99.workers.dev/reinterpret', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: currentTraceText,
          existingGenealogy: existingGenealogy,
          model: getSelectedModel(),
          hyperbolicApiKey: getHyperbolicKey() || undefined
        })
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
          
          // Process complete SSE events delineated by a blank line ("\n\n")
          let eventEnd;
          while ((eventEnd = buffer.indexOf('\n\n')) !== -1) {
            const rawEvent = buffer.slice(0, eventEnd).trim();
            buffer = buffer.slice(eventEnd + 2);
            if (!rawEvent.startsWith('data:')) continue;
            try {
              const jsonStr = rawEvent.slice(5).trim();
              if (jsonStr === '') continue;
              const data = JSON.parse(jsonStr);
              
              switch (data.type) {
                case 'status':
                  const scholarlyMessage = data.message || 'Reinterpreting genealogy';
                  showLoading(scholarlyMessage, true);
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
              console.error('Error parsing stream data:', parseError, 'Event:', rawEvent);
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

    } catch (error) {
      console.error('Reinterpret streaming error:', error);
      showError('Reinterpret streaming error: ' + error.message);
    }
  }

  function displayData(traceData, fromCache = false) {
    traceOutputDiv.innerHTML = '';
    questionsListUl.innerHTML = '';

    loadingStateDiv.style.display = 'none';
    errorStateDiv.style.display = 'none';
    resultsContainer.style.display = 'block';
    
    // Show search term display if we have currentTraceText
    const searchTermDisplay = document.getElementById('search-term-display');
    const searchTermText = document.getElementById('search-term-text');
    if (searchTermDisplay && searchTermText && currentTraceText) {
      searchTermText.textContent = `Tracing genealogy of: ${currentTraceText}`;
      searchTermDisplay.style.display = 'block';
    }
    
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
    // Updated regex to match the format: "Title (Year) [URL] — Claim"
    const itemRegex = /^(.*?)\s\(([^)]+)\)\s\[([^\]]+)\]\s—\s(.+)$/;
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
          const safeUrl = createSafeUrl(url);
          if (safeUrl) {
            const link = document.createElement('a');
            link.href = safeUrl;
            link.textContent = '[source]';
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            textContentDiv.appendChild(link);
          }
        }
        
        const claimSpan = document.createElement('span');
        claimSpan.textContent = ` — ${claim}`;
        textContentDiv.appendChild(claimSpan);
        itemDiv.appendChild(textContentDiv);

        const traceButton = document.createElement('button');
        traceButton.textContent = 'trace';
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
      copyAllBtn.textContent = 'copy';
      copyAllBtn.className = 'copy-all-button';
      copyAllBtn.addEventListener('click', () => copyToClipboard(allTraceText));
      copyAllContainer.appendChild(copyAllBtn);
      
      traceOutputDiv.appendChild(copyAllContainer);
    }

    if (!hasGenealogyItems && questionsSectionDiv.style.display === 'none') {
      showError("Could not parse a valid trace from the response.");
    }
    
    // Initialize collapsible elements for cached results
    initializeCollapsibleElements();
  }

  // Check if we have selected text, if not show intro page
  chrome.runtime.sendMessage({ action: "getTraceForSelectedText" }, function (response) {
    if (chrome.runtime.lastError) {
      showError("Could not communicate with background script: " + chrome.runtime.lastError.message);
      return;
    }
    if (response) {
      if (response.error) {
        if (response.error.includes("No text selected") || response.error.includes("no text")) {
          showIntroPage();
        } else {
          showError(response.error);
        }
      } else if (response.trace) {
        showLoading('Retrieving selected passage');
        displayData(response.trace, response.fromCache);
      } else if (response.selectedText) {
        showLoading('Retrieving selected passage');
        // Direct streaming with selected text
        performDirectTrace(response.selectedText);
      } else {
        showIntroPage();
      }
    } else {
      showIntroPage();
    }
  });

  function showIntroPage() {
    // Hide all other sections
    loadingStateDiv.style.display = 'none';
    errorStateDiv.style.display = 'none';
    resultsContainer.style.display = 'none';
    document.getElementById('search-term-display').style.display = 'none';
    
    // Show intro page
    const introPage = document.getElementById('intro-page');
    introPage.style.display = 'block';
    
    // Add event listeners for example terms
    const exampleButtons = document.querySelectorAll('.example-term');
    exampleButtons.forEach(button => {
      button.addEventListener('click', () => {
        const term = button.dataset.term;
        introPage.style.display = 'none';
        performDirectTrace(term);
      });
      
      // Add hover effect
      button.addEventListener('mouseenter', () => {
        button.style.backgroundColor = '#f5f5f5';
        button.style.borderColor = '#999';
      });
      
      button.addEventListener('mouseleave', () => {
        button.style.backgroundColor = '#fff';
        button.style.borderColor = '#ccc';
      });
    });
  }
}); 
