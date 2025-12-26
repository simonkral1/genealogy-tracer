// Etymology Explorer - Concept Tracer
document.addEventListener('DOMContentLoaded', function () {
    const etymoInput = document.getElementById('etymo-input');
    const etymoButton = document.getElementById('etymo-button');
    const exampleTags = document.querySelectorAll('.example-tag');
    const loadingState = document.getElementById('loading-state');
    const errorState = document.getElementById('error-state');
    const resultsContainer = document.getElementById('results-container');
    const meaningOutput = document.getElementById('meaning-output');
    const meaningSection = document.getElementById('meaning-section');
    const morphVisual = document.getElementById('morph-visual');
    const morphWord = document.getElementById('morph-word');
    const morphGlosses = document.getElementById('morph-glosses');
    const timeline = document.getElementById('timeline');
    const searchTermDisplay = document.getElementById('search-term');
    const copyAllButton = document.getElementById('copy-all-button');
    const retryButton = document.getElementById('retry-button');
    const filterCrucial = document.getElementById('filter-crucial');

    // State
    let currentWord = '';
    let streamedItems = [];
    let morphologyData = null;
    let isStreaming = false;

    // Loading phrases
    const loadingPhrases = [
        'consulting etymological sources',
        'tracing linguistic roots',
        'examining historical forms',
        'parsing Wiktionary entries',
        'analyzing semantic shifts',
        'cross-referencing cognates'
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

        let displayMessage = message || loadingPhrases[currentPhraseIndex];
        currentPhraseIndex = (currentPhraseIndex + 1) % loadingPhrases.length;

        const loadingMessage = document.getElementById('loading-message');
        const progressIndicator = document.getElementById('progress-indicator');

        if (loadingMessage) {
            loadingMessage.innerHTML = `${displayMessage}<span class="loading-dots">...</span>`;
        }

        if (progressIndicator) {
            const subPhrases = [
                'parsing entries and cross-references',
                'examining proto-forms',
                'tracing borrowing paths',
                'identifying semantic changes'
            ];
            progressIndicator.textContent = subPhrases[Math.floor(Math.random() * subPhrases.length)];
        }
    }

    function showError(message) {
        resultsContainer.style.display = 'none';
        loadingState.style.display = 'none';
        errorState.style.display = 'block';
        document.getElementById('error-message').textContent = message;
    }

    function showResults() {
        loadingState.style.display = 'none';
        errorState.style.display = 'none';
        resultsContainer.style.display = 'block';

        if (searchTermDisplay && currentWord) {
            searchTermDisplay.textContent = currentWord;
        }
    }

    function clearResults() {
        meaningOutput.innerHTML = '';
        morphWord.innerHTML = '';
        morphGlosses.innerHTML = '';
        morphVisual.style.display = 'none';
        meaningSection.style.display = 'none';

        // Clear timeline items except the line
        const timelineItems = timeline.querySelectorAll('.timeline-item');
        timelineItems.forEach(item => item.remove());

        streamedItems = [];
        morphologyData = null;
    }

    function renderMorphology(parts) {
        if (!parts || parts.length === 0) return;

        morphVisual.style.display = 'block';
        morphWord.innerHTML = '';
        morphGlosses.innerHTML = '';

        parts.forEach((part, idx) => {
            const partSpan = document.createElement('span');
            partSpan.className = 'morph-part';
            partSpan.textContent = part.form;
            morphWord.appendChild(partSpan);

            if (idx < parts.length - 1) {
                const sep = document.createElement('span');
                sep.className = 'morph-separator';
                sep.textContent = ' + ';
                morphWord.appendChild(sep);
            }

            const glossSpan = document.createElement('span');
            glossSpan.className = 'morph-gloss';
            glossSpan.textContent = part.gloss || '';
            morphGlosses.appendChild(glossSpan);
        });
    }

    function addEtymologyItem(item, index) {
        meaningSection.style.display = 'block';

        const itemDiv = document.createElement('div');
        itemDiv.className = `trace-item etymology-item category-${item.category || 'root'}`;
        if (item.crucial) {
            itemDiv.classList.add('crucial');
        }

        const safeUrl = createSafeUrl(item.link || '');
        const sourceLink = safeUrl
            ? `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="source-link">[source]</a>`
            : '';

        const badge = item.category
            ? `<span class="badge category-${item.category}">${item.category}</span>`
            : '';

        const confidenceBadge = item.confidence
            ? `<span class="badge confidence-${item.confidence}">${item.confidence}</span>`
            : '';

        const formDisplay = item.form ? `<strong>${sanitizeText(item.form)}</strong>` : '';
        const langDisplay = item.language ? `<em>(${sanitizeText(item.language)})</em>` : '';
        const dateDisplay = item.dateOrCentury ? `<span class="date">${sanitizeText(item.dateOrCentury)}</span>` : '';

        itemDiv.innerHTML = `
            <div class="item-header">
                ${badge}${confidenceBadge}
                ${formDisplay} ${langDisplay} ${dateDisplay} ${sourceLink}
            </div>
            <div class="item-gloss">${sanitizeText(item.gloss || '')}</div>
            <div class="item-essence">${sanitizeText(item.essence || '')}</div>
            ${item.note ? `<div class="item-note"><em>Note: ${sanitizeText(item.note)}</em></div>` : ''}
        `;

        meaningOutput.appendChild(itemDiv);

        // Add timeline marker
        if (item.dateOrCentury) {
            addTimelineItem(item.dateOrCentury, index);
        }

        // Apply filter
        applyFilter();
    }

    function addTimelineItem(date, itemIndex) {
        if (!timeline || !date) return;

        const timelineItem = document.createElement('div');
        timelineItem.className = 'timeline-item';

        const totalHeight = timeline.offsetHeight || 400;
        const padding = 20;
        const availableHeight = totalHeight - (2 * padding);
        const position = padding + (itemIndex * (availableHeight / Math.max(streamedItems.length, 1)));

        timelineItem.style.top = `${position}px`;
        timelineItem.innerHTML = `
            <div class="timeline-dot"></div>
            <div class="timeline-year">${date}</div>
        `;

        timeline.appendChild(timelineItem);
    }

    function applyFilter() {
        const showOnlyCrucial = filterCrucial && filterCrucial.checked;
        const items = meaningOutput.querySelectorAll('.etymology-item');

        items.forEach(item => {
            if (showOnlyCrucial && !item.classList.contains('crucial')) {
                item.style.display = 'none';
            } else {
                item.style.display = 'block';
            }
        });
    }

    async function traceEtymology(word) {
        if (!word.trim() || isStreaming) return;

        currentWord = word.trim();
        isStreaming = true;
        clearResults();

        etymoButton.disabled = true;
        etymoButton.textContent = 'Tracing...';

        showLoading();

        try {
            const response = await fetch('http://localhost:8787/etymology', {
                method: 'POST',
                headers: {
                    'Content-Type': 'text/plain',
                },
                body: currentWord
            });

            if (!response.ok) {
                throw new Error(`API Error: ${response.status}`);
            }

            if (!response.body) {
                throw new Error('No response body');
            }

            showResults();

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));

                            if (data.type === 'status') {
                                showLoading(data.message);
                                showResults();
                            } else if (data.type === 'morphology') {
                                morphologyData = data.parts;
                                renderMorphology(data.parts);
                            } else if (data.type === 'etymology_item') {
                                streamedItems.push(data);
                                addEtymologyItem(data, streamedItems.length - 1);
                            } else if (data.type === 'error') {
                                throw new Error(data.message);
                            } else if (data.type === 'complete') {
                                console.log('Etymology trace complete');
                            }
                        } catch (parseError) {
                            if (parseError.message && !parseError.message.includes('JSON')) {
                                throw parseError;
                            }
                        }
                    }
                }
            }

        } catch (error) {
            console.error('Etymology error:', error);
            showError(error.message || 'Failed to trace etymology');
        } finally {
            isStreaming = false;
            etymoButton.disabled = false;
            etymoButton.textContent = 'Trace Etymology';
        }
    }

    // Event listeners
    etymoButton.addEventListener('click', () => {
        const word = etymoInput.value.trim();
        if (word) {
            traceEtymology(word);
        }
    });

    etymoInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const word = etymoInput.value.trim();
            if (word) {
                traceEtymology(word);
            }
        }
    });

    exampleTags.forEach(tag => {
        tag.addEventListener('click', () => {
            const word = tag.dataset.word;
            if (word) {
                etymoInput.value = word;
                traceEtymology(word);
            }
        });
    });

    if (retryButton) {
        retryButton.addEventListener('click', () => {
            if (currentWord) {
                traceEtymology(currentWord);
            }
        });
    }

    if (filterCrucial) {
        filterCrucial.addEventListener('change', applyFilter);
    }

    if (copyAllButton) {
        copyAllButton.addEventListener('click', () => {
            let text = `Etymology of: ${currentWord}\n\n`;

            if (morphologyData) {
                text += `Morphology: ${morphologyData.map(p => `${p.form} (${p.gloss})`).join(' + ')}\n\n`;
            }

            streamedItems.forEach((item, idx) => {
                text += `${idx + 1}. ${item.form || ''} (${item.language || ''}, ${item.dateOrCentury || ''})\n`;
                text += `   ${item.gloss || ''}\n`;
                if (item.essence) text += `   ${item.essence}\n`;
                text += '\n';
            });

            navigator.clipboard.writeText(text).then(() => {
                const originalText = copyAllButton.textContent;
                copyAllButton.textContent = 'Copied!';
                setTimeout(() => {
                    copyAllButton.textContent = originalText;
                }, 2000);
            });
        });
    }
});
