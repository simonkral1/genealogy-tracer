// Web version of Concept Tracer
document.addEventListener('DOMContentLoaded', function () {
    const conceptInput = document.getElementById('concept-input');
    const traceButton = document.getElementById('trace-button');
    const exampleTags = document.querySelectorAll('.example-tag');
    const loadingState = document.getElementById('loading-state');
    const errorState = document.getElementById('error-state');
    const resultsContainer = document.getElementById('results-container');
    const traceOutput = document.getElementById('trace-output');
    const questionsSection = document.getElementById('questions-section');
    const questionsList = document.getElementById('questions-list');
    const timeline = document.getElementById('timeline');
    const searchTermDisplay = document.getElementById('search-term');
    const copyAllButton = document.getElementById('copy-all-button');
    const retryButton = document.getElementById('retry-button');

    // State
    let currentQuery = '';
    let streamedItems = [];
    let streamedQuestions = [];
    let isStreaming = false; // Add flag to track streaming state
    let traceStats = {
        itemCount: 0,
        questionCount: 0,
        earliestYear: null,
        latestYear: null
    };

    // Cache functions using localStorage
    const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

    function getCachedResponse(text) {
        const cacheKey = `concept_tracer_${text.toLowerCase().trim()}`;
        try {
            const cachedData = localStorage.getItem(cacheKey);
            if (cachedData) {
                const parsedData = JSON.parse(cachedData);
                const now = Date.now();
                
                if (now - parsedData.timestamp < CACHE_DURATION) {
                    console.log('Using cached response for:', text);
                    return parsedData.response;
                } else {
                    localStorage.removeItem(cacheKey);
                    console.log('Cache expired for:', text);
                }
            }
        } catch (error) {
            console.error('Error reading cache:', error);
        }
        return null;
    }

    function setCachedResponse(text, response) {
        const cacheKey = `concept_tracer_${text.toLowerCase().trim()}`;
        const cachedData = {
            response: response,
            timestamp: Date.now(),
            originalText: text
        };
        
        try {
            localStorage.setItem(cacheKey, JSON.stringify(cachedData));
            console.log('Cached response for:', text);
        } catch (error) {
            console.error('Error caching response:', error);
        }
    }

    // Scholarly loading phrases
    const scholarlyPhrases = [
        'examining the archives',
        'scouring the libraries',
        'consulting the catalogue',
        'perusing manuscripts',
        'investigating the stacks',
        'surveying bibliographies',
        'reviewing the indices',
        'searching the collection',
        'cross-referencing sources',
        'analyzing citations'
    ];
    
    let currentPhraseIndex = 0;

    // Helper functions
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

    function showLoading(message = null) {
        resultsContainer.style.display = 'none';
        errorState.style.display = 'none';
        loadingState.style.display = 'block';
        
        let displayMessage = message || scholarlyPhrases[currentPhraseIndex];
        currentPhraseIndex = (currentPhraseIndex + 1) % scholarlyPhrases.length;
        
        const loadingMessage = document.getElementById('loading-message');
        const progressIndicator = document.getElementById('progress-indicator');
        
        if (loadingMessage) {
            loadingMessage.innerHTML = `${displayMessage}<span class="loading-dots">...</span>`;
        }
        
        if (progressIndicator) {
            const subPhrases = [
                'consulting references and citations',
                'cross-referencing historical documents',
                'verifying scholarly sources',
                'collating intellectual lineages',
                'examining chronological evidence',
                'tracing conceptual evolution'
            ];
            const randomSubPhrase = subPhrases[Math.floor(Math.random() * subPhrases.length)];
            progressIndicator.textContent = randomSubPhrase;
        }
    }

    function showError(message) {
        resultsContainer.style.display = 'none';
        loadingState.style.display = 'none';
        errorState.style.display = 'block';
        
        const friendlyErrors = {
            'Failed to fetch': 'Unable to connect to the service. Please check your internet connection.',
            'NetworkError': 'Network connection failed. Please try again.',
            'AbortError': 'Request timed out. Please try again.',
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
        
        document.getElementById('error-message').textContent = displayMessage;
    }

    function showResults() {
        loadingState.style.display = 'none';
        errorState.style.display = 'none';
        resultsContainer.style.display = 'block';
        
        // Update the search term display
        const searchTermSpan = document.getElementById('search-term');
        if (searchTermSpan && currentQuery) {
            searchTermSpan.textContent = currentQuery;
        }
    }

    // Timeline functions
    function addTimelineItem(year, itemIndex) {
        if (!timeline || !year) return;
        
        const timelineItem = document.createElement('div');
        timelineItem.className = 'timeline-item';
        
        const totalHeight = timeline.offsetHeight || 400;
        const itemHeight = 16;
        const padding = 20;
        const availableHeight = totalHeight - (2 * padding);
        const position = padding + (itemIndex * (availableHeight / Math.max(streamedItems.length - 1, 1)));
        
        timelineItem.style.top = `${position}px`;
        timelineItem.innerHTML = `
            <div class="timeline-dot"></div>
            <div class="timeline-year">${year}</div>
        `;
        
        timeline.appendChild(timelineItem);
    }

    function updateTimelinePositions() {
        if (!timeline) return;
        
        const timelineItems = timeline.querySelectorAll('.timeline-item');
        const totalHeight = timeline.offsetHeight || 400;
        const padding = 20;
        const availableHeight = totalHeight - (2 * padding);
        
        timelineItems.forEach((item, index) => {
            const position = padding + (index * (availableHeight / Math.max(timelineItems.length - 1, 1)));
            item.style.top = `${position}px`;
        });
    }

    // Copy to clipboard function
    function copyToClipboard(text) {
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(() => {
                showTemporaryMessage('Copied to clipboard');
            }).catch(err => {
                console.error('Failed to copy:', err);
                fallbackCopyTextToClipboard(text);
            });
        } else {
            fallbackCopyTextToClipboard(text);
        }
    }

    function fallbackCopyTextToClipboard(text) {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.top = "0";
        textArea.style.left = "0";
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
            document.execCommand('copy');
            showTemporaryMessage('Copied to clipboard');
        } catch (err) {
            console.error('Fallback: Oops, unable to copy', err);
            showTemporaryMessage('Unable to copy');
        }
        
        document.body.removeChild(textArea);
    }

    function showTemporaryMessage(message) {
        const messageDiv = document.createElement('div');
        messageDiv.textContent = message;
        messageDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #333;
            color: white;
            padding: 10px;
            border-radius: 4px;
            z-index: 1000;
            font-family: var(--font-mono);
            font-size: 12px;
        `;
        
        document.body.appendChild(messageDiv);
        
        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.parentNode.removeChild(messageDiv);
            }
        }, 3000);
    }

    // Add genealogy item to display - EXACT COPY FROM WORKING EXTENSION
    function addGenealogyItem(item) {
        // Check if trace output exists
        if (!traceOutput) {
            return;
        }
        
        // Hide loading status once first item appears - CRITICAL!
        loadingState.style.display = 'none';
        resultsContainer.style.display = 'block';
        
        // Update the search term display
        const searchTermSpan = document.getElementById('search-term');
        if (searchTermSpan && currentQuery) {
            searchTermSpan.textContent = currentQuery;
        }
        
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
        traceButton.addEventListener('click', () => performTrace(item.title));
        buttonsDiv.appendChild(traceButton);
        
        const expandButton = document.createElement('button');
        expandButton.textContent = 'expand';
        expandButton.className = 'expand-button';
        expandButton.onclick = () => expandItem(expandButton, item);
        buttonsDiv.appendChild(expandButton);
        
        itemDiv.appendChild(buttonsDiv);
        
        // Insert item BEFORE the copy-all container if it exists
        const copyAllContainer = traceOutput.querySelector('.copy-all-container');
        if (copyAllContainer) {
            traceOutput.insertBefore(itemDiv, copyAllContainer);
        } else {
            traceOutput.appendChild(itemDiv);
        }
        
        // Animate the item in with staggered delay
        setTimeout(() => {
            itemDiv.style.transition = 'all 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
            itemDiv.style.opacity = '1';
            itemDiv.style.transform = 'translateY(0)';
        }, traceStats.itemCount * 100);
        
        // Add timeline item
        addTimelineItem(item.year, traceStats.itemCount);
        
        // Update timeline positions progressively
        setTimeout(updateTimelinePositions, 100);
    }

    // Expand item functionality
    async function expandItem(button, item) {
        if (button.disabled) return;
        
        button.disabled = true;
        button.textContent = 'expanding...';
        
        try {
            const response = await fetch('http://localhost:8787/expand', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: item.title,
                    year: item.year,
                    claim: item.claim
                })
            });

            if (!response.ok) {
                throw new Error(`Expand service error: ${response.status}`);
            }

            const responseData = await response.json();
            
            if (responseData.content) {
                // Extract content from <explanation> tags if present
                const explanationMatch = responseData.content.match(/<explanation>([\s\S]*?)<\/explanation>/);
                const cleanContent = explanationMatch && explanationMatch[1] ? explanationMatch[1].trim() : responseData.content.trim();
                
                // Create expanded content div
                const expandedDiv = document.createElement('div');
                expandedDiv.className = 'expanded-content visible';
                expandedDiv.textContent = cleanContent;
                
                // Insert after the buttons
                const traceItem = button.closest('.trace-item');
                traceItem.appendChild(expandedDiv);
                
                button.textContent = 'collapse';
                button.onclick = () => {
                    expandedDiv.remove();
                    button.textContent = 'expand';
                    button.disabled = false;
                    button.onclick = () => expandItem(button, item);
                };
            } else {
                throw new Error('No content received');
            }
        } catch (error) {
            console.error('Expand error:', error);
            button.textContent = 'expand failed';
            setTimeout(() => {
                button.textContent = 'expand';
                button.disabled = false;
            }, 3000);
        }
    }

    // Add question to display
    function addQuestion(questionText) {
        // Update stats
        traceStats.questionCount++;
        
        const li = document.createElement('li');
        li.textContent = questionText;
        li.style.opacity = '0';
        li.style.transform = 'translateX(-10px)';
        questionsList.appendChild(li);
        
        setTimeout(() => {
            li.style.transition = 'all 0.3s ease';
            li.style.opacity = '1';
            li.style.transform = 'translateX(0)';
        }, traceStats.questionCount * 50);
        
        questionsSection.style.display = 'block';
    }

    function completeStreaming() {
        // Clear streaming flag
        isStreaming = false;
        
        // Hide loading state when streaming completes
        loadingState.style.display = 'none';
        
        // Make sure results container is visible
        resultsContainer.style.display = 'block';
        
        // Double-check that trace output is visible
        if (traceOutput) {
            traceOutput.style.display = 'block';
        }
        
        if (streamedItems.length > 0 || streamedQuestions.length > 0) {
            // Remove any existing actions container
            const existingActions = traceOutput.querySelector('.actions-container');
            if (existingActions) {
                existingActions.remove();
            }
            
            // Also remove old copy-all container for backward compatibility
            const existingCopyAll = traceOutput.querySelector('.copy-all-container');
            if (existingCopyAll) {
                existingCopyAll.remove();
            }
            
            // Force all trace items to be visible
            const allTraceItems = traceOutput.querySelectorAll('.trace-item');
            allTraceItems.forEach(item => {
                item.style.display = 'flex'; // Ensure items are displayed
                item.style.opacity = '1'; // Ensure opacity is set
            });
            
            // Create new action buttons container
            const actionsContainer = document.createElement('div');
            actionsContainer.className = 'actions-container';
            actionsContainer.style.cssText = 'display: flex; gap: 10px; justify-content: center; margin-top: 20px;';
            
            const copyAllBtn = document.createElement('button');
            copyAllBtn.textContent = 'Copy All Results';
            copyAllBtn.className = 'copy-all-button';
            copyAllBtn.addEventListener('click', () => {
                let allText = `Genealogy of: ${currentQuery}\n\n`;
                
                streamedItems.forEach((item, index) => {
                    allText += `${index + 1}. ${item.title || 'Unknown'} (${item.year || 'Unknown year'})\n`;
                    allText += `   ${item.claim || 'No description'}\n`;
                    if (item.url || item.source) {
                        allText += `   Source: ${item.url || item.source}\n`;
                    }
                    allText += '\n';
                });
                
                if (streamedQuestions.length > 0) {
                    allText += 'Research Questions:\n';
                    streamedQuestions.forEach((question, index) => {
                        allText += `${index + 1}. ${question}\n`;
                    });
                }
                
                copyToClipboard(allText);
            });
            
            const reinterpretBtn = document.createElement('button');
            reinterpretBtn.textContent = 'Reinterpret';
            reinterpretBtn.className = 'copy-all-button'; // Use same styling as copy button
            reinterpretBtn.addEventListener('click', (e) => {
                console.log('Reinterpret button clicked!');
                e.preventDefault();
                performReinterpret();
            });
            
            actionsContainer.appendChild(copyAllBtn);
            actionsContainer.appendChild(reinterpretBtn);
            traceOutput.appendChild(actionsContainer);
            
            // Cache the complete response for future use
            const cacheData = {
                genealogy: streamedItems,
                questions: streamedQuestions
            };
            setCachedResponse(currentQuery, cacheData);
        }
        
        // Re-enable trace button
        traceButton.disabled = false;
        traceButton.textContent = 'Trace Genealogy';
        
        // Update timeline positions after all items are loaded
        setTimeout(updateTimelinePositions, 100);
        
        // Final safety check - ensure all items are visible
        setTimeout(() => {
            const finalItems = traceOutput.querySelectorAll('.trace-item');
            finalItems.forEach(item => {
                if (item.style.display === 'none' || window.getComputedStyle(item).display === 'none') {
                    item.style.display = 'flex';
                }
            });
        }, 500);
    }

    // Main trace function
    async function performTraceApiCall() {
        // Set streaming flag
        isStreaming = true;

        // Disable trace button
        traceButton.disabled = true;
        traceButton.textContent = 'Tracing...';
        
        showLoading();

        try {
            const response = await fetch('http://localhost:8787/stream', {
                method: 'POST',
                headers: {
                    'Content-Type': 'text/plain',
                },
                body: currentQuery
            });

            if (!response.ok) {
                throw new Error(`API Error: ${response.status}`);
            }

            if (!response.body) {
                throw new Error('No response body');
            }

            // Handle streaming response - EXACT COPY FROM WORKING EXTENSION
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let streamCompleted = false;

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
                                    if (streamCompleted) break;
                                    const scholarlyPhrases = {
                                        'Querying Wikipedia': 'Searching bibliographic databases',
                                        'Calling Claude': 'Consulting historical records',
                                        'Processing genealogy': 'Tracing intellectual lineages',
                                        'Finalizing results': 'Compiling scholarly findings'
                                    };
                                    const scholarlyMessage = scholarlyPhrases[data.message] || 'Scouring the archives';
                                    showLoading(scholarlyMessage);
                                    break;
                                    
                                case 'genealogy_item':
                                    if (streamCompleted) break;
                                    streamedItems.push(data);
                                    addGenealogyItem(data);
                                    break;
                                    
                                case 'section':
                                    if (streamCompleted) break;
                                    if (data.section === 'questions') {
                                        questionsSection.style.display = 'block';
                                    }
                                    break;
                                    
                                case 'question':
                                    if (streamCompleted) break;
                                    addQuestion(data.text);
                                    streamedQuestions.push(data.text);
                                    break;
                                    
                                case 'complete':
                                    if (!streamCompleted) {
                                        streamCompleted = true;
                                        completeStreaming();
                                    }
                                    return;
                                    
                                case 'error':
                                    if (!streamCompleted) {
                                        streamCompleted = true;
                                        isStreaming = false;
                                        showError(data.message);
                                    }
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

            // Only complete if stream didn't already complete
            if (!streamCompleted && (streamedItems.length > 0 || streamedQuestions.length > 0)) {
                completeStreaming();
            }

        } catch (error) {
            console.error('Trace error:', error);
            isStreaming = false;
            showError(error.message || 'An error occurred while tracing the concept.');
        } finally {
            traceButton.disabled = false;
            traceButton.textContent = 'Trace Genealogy';
        }
    }

    async function performTrace(concept) {
        if (!concept.trim()) {
            showError('Please enter a concept to trace.');
            return;
        }

        // Prevent multiple simultaneous traces
        if (isStreaming) {
            return;
        }

        currentQuery = concept.trim();
        
        // Clear previous results
        traceOutput.innerHTML = '';
        questionsList.innerHTML = '';
        if (timeline) {
            const timelineItems = timeline.querySelectorAll('.timeline-item');
            timelineItems.forEach(item => item.remove());
        }
        questionsSection.style.display = 'none';
        streamedItems = [];
        streamedQuestions = [];
        traceStats = {
            itemCount: 0,
            questionCount: 0,
            earliestYear: null,
            latestYear: null
        };

        // Check cache first
        const cachedResponse = getCachedResponse(currentQuery);
        if (cachedResponse && cachedResponse.genealogy && cachedResponse.genealogy.length > 0) {
            displayCachedResults(cachedResponse);
            return;
        }

        // Make API call
        await performTraceApiCall();
    }

    function displayCachedResults(cachedData) {
        // Make sure container is visible
        showResults();
        
        if (cachedData.genealogy && cachedData.genealogy.length > 0) {
            cachedData.genealogy.forEach(item => {
                addGenealogyItem(item);
            });
            
            // Store the items in streamedItems for consistency
            streamedItems = [...cachedData.genealogy];
            
            if (cachedData.questions && cachedData.questions.length > 0) {
                cachedData.questions.forEach(question => {
                    addQuestion(question);
                });
                
                // Store questions in streamedQuestions
                streamedQuestions = [...cachedData.questions];
            }
            
            // Complete the streaming process for cached results
            completeStreaming();
        } else {
            // If cached data is invalid, clear it and make a fresh request
            const cacheKey = `concept_tracer_${currentQuery.toLowerCase().trim()}`;
            localStorage.removeItem(cacheKey);
            
            // Make a fresh API call
            performTraceApiCall();
        }
    }

    // Event listeners
    traceButton.addEventListener('click', () => {
        const concept = conceptInput.value.trim();
        if (concept) {
            performTrace(concept);
        }
    });

    conceptInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const concept = conceptInput.value.trim();
            if (concept) {
                performTrace(concept);
            }
        }
    });

    // Example tags
    exampleTags.forEach(tag => {
        tag.addEventListener('click', () => {
            const concept = tag.dataset.concept;
            conceptInput.value = concept;
            performTrace(concept);
        });
    });

    // Remove the old copy all button event listener since we're creating it dynamically
    const oldCopyAllButton = document.getElementById('copy-all-button');
    if (oldCopyAllButton) {
        oldCopyAllButton.style.display = 'none'; // Hide the static button
    }

    // Retry button
    retryButton.addEventListener('click', () => {
        if (currentQuery) {
            performTrace(currentQuery);
        }
    });

    // Focus input on load
    conceptInput.focus();
    
    // Reinterpret function to get alternative genealogy
    async function performReinterpret() {
        console.log('Reinterpret function called');
        console.log('Current query:', currentQuery);
        console.log('Streamed items:', streamedItems);
        console.log('Is streaming:', isStreaming);
        
        if (!currentQuery || streamedItems.length === 0 || isStreaming) {
            console.log('Reinterpret cancelled - missing data or already streaming');
            return;
        }

        // Prepare data for reinterpret endpoint
        const requestData = {
            query: currentQuery,
            existingGenealogy: streamedItems.map(item => ({
                title: item.title,
                year: item.year,
                claim: item.claim,
                url: item.url
            }))
        };

        console.log('Request data prepared:', requestData);

        // Clear current results 
        traceOutput.innerHTML = '';
        questionsList.innerHTML = '';
        if (timeline) {
            const timelineItems = timeline.querySelectorAll('.timeline-item');
            timelineItems.forEach(item => item.remove());
        }
        questionsSection.style.display = 'none';
        streamedItems = [];
        streamedQuestions = [];

        // Set streaming flag
        isStreaming = true;

        // Disable buttons
        const traceButton = document.getElementById('trace-button');
        if (traceButton) {
            traceButton.disabled = true;
            traceButton.textContent = 'Reinterpreting...';
        }

        showLoading('Searching for alternative perspectives');

        try {
            const response = await fetch('http://localhost:8787/reinterpret', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestData)
            });

            if (!response.ok) {
                throw new Error(`API Error: ${response.status}`);
            }

            if (!response.body) {
                throw new Error('No response body');
            }

            // Handle streaming response (same logic as original trace)
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let streamCompleted = false;

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
                            console.log('🔄 Reinterpret: Received data:', data);
                            
                            switch (data.type) {
                                case 'status':
                                    if (streamCompleted) break;
                                    const reinterpretPhrases = {
                                        'Searching for alternative perspectives': 'Exploring different intellectual traditions',
                                        'Consulting alternative sources': 'Examining counter-narratives and marginalized voices',
                                        'Generating alternative genealogy': 'Constructing alternative genealogy'
                                    };
                                    const scholarlyMessage = reinterpretPhrases[data.message] || data.message;
                                    showLoading(scholarlyMessage);
                                    break;
                                    
                                case 'genealogy_item':
                                    if (streamCompleted) break;
                                    console.log('📝 Reinterpret: Adding genealogy item:', data);
                                    streamedItems.push(data);
                                    addGenealogyItem(data);
                                    break;
                                    
                                case 'section':
                                    if (streamCompleted) break;
                                    if (data.section === 'questions') {
                                        questionsSection.style.display = 'block';
                                    }
                                    break;
                                    
                                case 'question':
                                    if (streamCompleted) break;
                                    addQuestion(data.text);
                                    streamedQuestions.push(data.text);
                                    break;
                                    
                                case 'complete':
                                    if (!streamCompleted) {
                                        streamCompleted = true;
                                        completeStreaming();
                                    }
                                    return;
                                    
                                case 'error':
                                    if (!streamCompleted) {
                                        streamCompleted = true;
                                        isStreaming = false;
                                        showError(data.message);
                                    }
                                    return;
                            }
                        } catch (parseError) {
                            console.error('Error parsing reinterpret stream data:', parseError, 'Event:', rawEvent);
                        }
                    }
                }
            } finally {
                reader.releaseLock();
            }

            // Only complete if stream didn't already complete
            if (!streamCompleted && (streamedItems.length > 0 || streamedQuestions.length > 0)) {
                completeStreaming();
            }

        } catch (error) {
            console.error('Reinterpret error:', error);
            isStreaming = false;
            showError(error.message || 'An error occurred while reinterpreting the concept.');
        } finally {
            if (traceButton) {
                traceButton.disabled = false;
                traceButton.textContent = 'Trace Genealogy';
            }
        }
    }

    // Debug function to clear all cached data (accessible from browser console)
    window.clearConceptCache = function() {
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('concept_tracer_')) {
                localStorage.removeItem(key);
                console.log('Removed cache entry:', key);
            }
        });
        console.log('All concept tracer cache cleared');
    };
    
    // Clear machine learning cache specifically for testing
    window.clearMLCache = function() {
        localStorage.removeItem('concept_tracer_machine learning');
        console.log('Cleared machine learning cache');
    };
}); 