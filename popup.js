document.addEventListener('DOMContentLoaded', function () {
  const resultsContainer = document.getElementById('results-container');
  const traceOutputDiv = document.getElementById('trace-output');
  const questionsSectionDiv = document.getElementById('questions-section');
  const questionsListUl = document.getElementById('questions-list');
  const loadingStateDiv = document.getElementById('loading-state');
  const errorStateDiv = document.getElementById('error-state');
  const errorStateP = errorStateDiv.querySelector('p');

  const questionsHeader = document.getElementById('questions-header');
  const questionsContent = document.getElementById('questions-content');
  const timeline = document.getElementById('timeline');

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
    console.log('🔥 MAKING ENHANCED LLM CALL for:', item.title);
    
    try {
      const prompt = `You are a brilliant intellectual historian writing for curious scholars. Analyze "${item.title}" (${item.year}) with fascinating specificity.

Key insight to develop: ${item.claim}

Write 3-4 sentences that reveal:
1. What made this work revolutionary or paradigm-shifting for its time
2. A specific intellectual move, method, or insight that influenced later thinkers
3. How it connects to broader cultural/political contexts of ${item.year}
4. Why it still matters for contemporary debates

Be concrete, vivid, and avoid generic academic language. Think Foucault meeting a brilliant graduate seminar - scholarly but intellectually electric.`;

      console.log('📝 Sending prompt to LLM:', prompt);

      const response = await fetch('https://red-heart-d66e.simon-kral99.workers.dev/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: prompt
      });

      console.log('📡 Response status:', response.status);

      if (!response.ok) {
        console.error('❌ API Error:', response.status);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';
      let buffer = '';

      console.log('📥 Starting to read stream...');

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            console.log('✅ Stream complete');
            break;
          }
          
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
              
              // Extract text from different possible response formats
              if (data.type === 'content' && data.text) {
                fullResponse += data.text;
              } else if (data.content) {
                fullResponse += data.content;
              } else if (data.delta && data.delta.text) {
                fullResponse += data.delta.text;
              } else if (data.text) {
                fullResponse += data.text;
              }
            } catch (parseError) {
              console.error('Error parsing stream data:', parseError, 'Event:', rawEvent);
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
      
      console.log('📄 Full LLM response:', fullResponse);
      
      if (fullResponse.trim()) {
        // Clean and format the response
        let cleaned = fullResponse.trim();
        
        // Remove any markdown formatting
        cleaned = cleaned.replace(/\*\*/g, '').replace(/\*/g, '');
        
        // Ensure it ends with proper punctuation
        if (!cleaned.endsWith('.') && !cleaned.endsWith('!') && !cleaned.endsWith('?')) {
          cleaned += '.';
        }
        
        console.log('✨ Enhanced response generated:', cleaned.substring(0, 100) + '...');
        return cleaned;
      } else {
        console.warn('⚠️ Empty LLM response, using enhanced fallback for:', item.title);
        throw new Error('Empty response from LLM');
      }
      
    } catch (error) {
      console.error('💥 LLM call failed:', error);
      
      // Enhanced contextual fallback with more engaging content
      const title = item.title.toLowerCase();
      const claim = item.claim.toLowerCase();
      const year = parseInt(item.year) || 0;
      
      if (title.includes('aristotle') || year < 500) {
        return `${item.title} revolutionized intellectual inquiry by systematically categorizing knowledge in ways that dominated Western thought for over a millennium. Aristotle's method of empirical observation combined with logical reasoning created the template for scientific investigation, directly influencing Islamic scholars like Averroes and later shaping medieval universities. The work's integration of practical wisdom with theoretical knowledge established philosophy as both contemplative and politically engaged. Its shadow still looms over contemporary debates about the relationship between ethics, politics, and human flourishing.`;
      } else if (title.includes('foucault') || claim.includes('power') || claim.includes('discourse')) {
        return `${item.title} dismantled the illusion that knowledge is neutral by revealing how power relations shape what counts as truth in any given era. Foucault's archaeological method exposed the violent discontinuities hidden beneath smooth narratives of intellectual progress, showing how madness, sexuality, and criminality were constructed through specific institutional practices. This work provided the conceptual tools for understanding how seemingly objective disciplines like medicine and psychology function as technologies of social control. Its insights remain crucial for analyzing how contemporary institutions—from social media algorithms to psychiatric diagnosis—continue to shape human subjectivity.`;
      } else if (title.includes('gender') || title.includes('sex') || claim.includes('gender') || title.includes('butler')) {
        return `${item.title} shattered the naturalized boundary between sex and gender by revealing both as performative constructs maintained through repeated acts and social rituals. This work demonstrated how the seemingly stable categories of male/female are actually fragile effects of power that require constant reinforcement to maintain their appearance of inevitability. By exposing the theatrical dimension of gender identity, it opened space for subversive performances that could destabilize heteronormative assumptions. The work's influence extends far beyond gender studies, providing tools for analyzing how all identity categories are socially constructed yet experientially real.`;
      } else if (year >= 1960 || claim.includes('postmodern') || claim.includes('structure')) {
        return `${item.title} emerged during the intellectual upheaval of the 1960s-70s, when traditional humanistic certainties were being systematically dismantled by structuralist and post-structuralist thought. This work contributed to the broader project of revealing how seemingly natural categories—from the individual subject to historical progress—are actually products of specific cultural and linguistic systems. Its theoretical innovations helped establish new ways of reading texts, analyzing culture, and understanding the relationship between language and reality. The work remains vital for contemporary discussions about identity, representation, and the politics of knowledge production.`;
      } else {
        return `${item.title} marked a crucial intervention in ${Math.floor(year/100)*100}s intellectual life by challenging the dominant frameworks of its time through innovative methodological approaches. The work's central insight—that ${item.claim.toLowerCase()}—opened new possibilities for understanding both historical developments and contemporary problems. Its influence can be traced through subsequent generations of scholars who adopted its analytical tools while adapting them to new contexts and questions. The work's enduring significance lies in its demonstration that rigorous scholarship can simultaneously illuminate the past and transform present ways of thinking.`;
      }
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
    
    setTimeout(() => {
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
          const traceItemHeight = traceItems[index].offsetHeight;
          const cumulativeHeight = Array.from(traceItems).slice(0, index).reduce((sum, item) => {
            return sum + item.offsetHeight + 2; // +2 for margin-bottom
          }, 0);
          
          const centerPosition = cumulativeHeight + (traceItemHeight / 2) - 8;
          timelineItem.style.top = `${centerPosition}px`;
        }
      });
    }, 100);
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
      updateTimelinePositions();
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
    updateTimelinePositions();
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
      
      traceOutputDiv.appendChild(copyAllContainer);

      // Cache the complete response
      const fullTrace = allTraceText;
      if (currentTraceText) {
        setCachedResponse(currentTraceText, fullTrace);
      }
    }
    

    
    // Update timeline positions after all items are loaded
    updateTimelinePositions();
  }

  let currentTraceText = null;

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
                  showLoading('Research complete', false);
                  setTimeout(() => {
                    completeStreaming();
                  }, 800);
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
  }

  showLoading('Retrieving selected passage');
  chrome.runtime.sendMessage({ action: "getTraceForSelectedText" }, function (response) {
    if (chrome.runtime.lastError) {
      showError("Could not communicate with background script: " + chrome.runtime.lastError.message);
      return;
    }
    if (response) {
      if (response.error) {
        showError(response.error);
      } else if (response.trace) {
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