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
        
        // Add item to trace output
        traceOutput.appendChild(itemDiv);
        
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
            const response = await fetch('https://red-heart-d66e.simon-kral99.workers.dev/expand', {
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
                // Create expanded content div
                const expandedDiv = document.createElement('div');
                expandedDiv.className = 'expanded-content visible';
                expandedDiv.textContent = responseData.content;
                
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
        // Hide loading state when streaming completes
        loadingState.style.display = 'none';
        
        if (streamedItems.length > 0 || streamedQuestions.length > 0) {
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
    }

    // Main trace function
    async function performTrace(concept) {
        if (!concept.trim()) {
            showError('Please enter a concept to trace.');
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
        if (cachedResponse) {
            displayCachedResults(cachedResponse);
            return;
        }

        // Disable trace button
        traceButton.disabled = true;
        traceButton.textContent = 'Tracing...';
        
        showLoading();

        try {
            const response = await fetch('https://red-heart-d66e.simon-kral99.workers.dev/stream', {
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
                                    addGenealogyItem(data);
                                    streamedItems.push(data);
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
            showError(error.message || 'An error occurred while tracing the concept.');
        } finally {
            traceButton.disabled = false;
            traceButton.textContent = 'Trace Genealogy';
        }
    }

    function displayCachedResults(cachedData) {
        if (cachedData.genealogy && cachedData.genealogy.length > 0) {
            cachedData.genealogy.forEach(item => {
                streamedItems.push(item);
                addGenealogyItem(item);
            });
            
            if (cachedData.questions && cachedData.questions.length > 0) {
                cachedData.questions.forEach(question => {
                    streamedQuestions.push(question);
                    addQuestion(question);
                });
            }
            
            // Complete the streaming process for cached results
            completeStreaming();
        } else {
            showError('No cached results found');
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

    // Copy all results
    copyAllButton.addEventListener('click', () => {
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

    // Retry button
    retryButton.addEventListener('click', () => {
        if (currentQuery) {
            performTrace(currentQuery);
        }
    });

    // Focus input on load
    conceptInput.focus();
}); 