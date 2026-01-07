// Network Visualization for Concept Tracer
// D3.js force-directed graph for exploring genealogy connections

class GenealogyNetwork {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.nodes = [];
        this.links = [];
        this.concepts = new Map();
        this.simulation = null;
        this.svg = null;
        this.g = null;
        this.selectedNode = null;
        this.tooltip = null;

        // Color palette for different concepts (grayscale)
        this.colorPalette = ['#2c2c2c', '#4a4a4a', '#666666', '#888888', '#555555'];

        this.initSVG();
        this.initSimulation();
        this.initZoom();
        this.initTooltip();
        this.loadState();
        this.updateUI();
    }

    initSVG() {
        const rect = this.container.getBoundingClientRect();
        this.width = rect.width || 800;
        this.height = rect.height || 600;

        this.svg = d3.select(this.container)
            .append('svg')
            .attr('width', '100%')
            .attr('height', '100%')
            .attr('viewBox', `0 0 ${this.width} ${this.height}`);

        // Main group for zoom/pan transforms
        this.g = this.svg.append('g');

        // Groups for layering (links below nodes)
        this.linksGroup = this.g.append('g').attr('class', 'links-group');
        this.nodesGroup = this.g.append('g').attr('class', 'nodes-group');

        // Define arrow marker for directed links
        const defs = this.svg.append('defs');

        defs.append('marker')
            .attr('id', 'arrowhead')
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', 25)
            .attr('refY', 0)
            .attr('markerWidth', 8)
            .attr('markerHeight', 8)
            .attr('orient', 'auto')
            .append('path')
            .attr('d', 'M0,-4L10,0L0,4')
            .attr('fill', '#888');

        defs.append('marker')
            .attr('id', 'arrowhead-cross')
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', 25)
            .attr('refY', 0)
            .attr('markerWidth', 8)
            .attr('markerHeight', 8)
            .attr('orient', 'auto')
            .append('path')
            .attr('d', 'M0,-4L10,0L0,4')
            .attr('fill', '#c44');
    }

    initTooltip() {
        this.tooltip = d3.select('body').append('div')
            .attr('class', 'network-tooltip')
            .style('position', 'absolute')
            .style('visibility', 'hidden')
            .style('background', '#fff')
            .style('border', '1px solid #ccc')
            .style('padding', '8px 12px')
            .style('font-family', 'Courier Prime, monospace')
            .style('font-size', '12px')
            .style('max-width', '300px')
            .style('box-shadow', '2px 2px 6px rgba(0,0,0,0.1)')
            .style('pointer-events', 'none')
            .style('z-index', '1000');
    }

    initSimulation() {
        this.simulation = d3.forceSimulation()
            .force('link', d3.forceLink()
                .id(d => d.id)
                .distance(140)
                .strength(0.7))
            .force('charge', d3.forceManyBody()
                .strength(-500)
                .distanceMax(400))
            .force('center', d3.forceCenter(this.width / 2, this.height / 2))
            .force('collision', d3.forceCollide().radius(60))
            .force('x', d3.forceX(this.width / 2).strength(0.05))
            .force('y', d3.forceY(this.height / 2).strength(0.05))
            .on('tick', () => this.tick());
    }

    initZoom() {
        const zoom = d3.zoom()
            .scaleExtent([0.2, 4])
            .on('zoom', (event) => {
                this.g.attr('transform', event.transform);
            });

        this.svg.call(zoom);

        // Double-click to reset zoom
        this.svg.on('dblclick.zoom', () => {
            this.svg.transition()
                .duration(500)
                .call(zoom.transform, d3.zoomIdentity);
        });
    }

    tick() {
        // Update link positions
        this.linksGroup.selectAll('.network-link')
            .attr('x1', d => d.source.x)
            .attr('y1', d => d.source.y)
            .attr('x2', d => d.target.x)
            .attr('y2', d => d.target.y);

        // Update node positions
        this.nodesGroup.selectAll('.network-node-group')
            .attr('transform', d => `translate(${d.x},${d.y})`);
    }

    async addConcept(query) {
        if (!query.trim()) return;

        const queryLower = query.toLowerCase().trim();

        // Check if already traced
        if (this.concepts.has(queryLower)) {
            console.log('Concept already traced:', query);
            return;
        }

        // Show loading
        this.showLoading(true);

        // Assign color
        const color = this.colorPalette[this.concepts.size % this.colorPalette.length];

        this.concepts.set(queryLower, {
            query: query,
            color: color,
            nodeIds: [],
            visible: true
        });

        try {
            await this.fetchGenealogy(query);
            this.render();
            this.saveState();
            this.updateUI();
        } catch (error) {
            console.error('Error fetching genealogy:', error);
            // Remove failed concept
            this.concepts.delete(queryLower);
            alert('Failed to trace concept. Make sure the API server is running.');
        } finally {
            this.showLoading(false);
        }
    }

    async fetchGenealogy(query) {
        const concept = this.concepts.get(query.toLowerCase().trim());
        if (!concept) return;

        const response = await fetch('http://localhost:8787/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: query
        });

        if (!response.ok) {
            throw new Error('Failed to fetch genealogy');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let prevNodeId = null;
        let position = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split('\n\n');
            buffer = events.pop();

            for (const event of events) {
                if (!event.startsWith('data:')) continue;

                try {
                    const jsonStr = event.slice(5).trim();
                    if (!jsonStr) continue;

                    const data = JSON.parse(jsonStr);

                    if (data.type === 'genealogy_item') {
                        position++;
                        const nodeId = this.generateNodeId(data.title, data.year);

                        // Check for cross-reference with existing nodes
                        const existingNode = this.findCrossReference(data.title, data.year);

                        if (existingNode) {
                            // Link to existing node - this creates a cross-concept connection
                            concept.nodeIds.push(existingNode.id);

                            if (prevNodeId && prevNodeId !== existingNode.id) {
                                this.addLink(prevNodeId, existingNode.id, 'cross-concept', query);
                            }
                            prevNodeId = existingNode.id;
                        } else {
                            // Create new node
                            const node = {
                                id: nodeId,
                                title: data.title,
                                year: data.year,
                                url: data.url,
                                claim: data.claim,
                                conceptQuery: query,
                                position: position,
                                color: concept.color,
                                x: this.width / 2 + (Math.random() - 0.5) * 300,
                                y: this.height / 2 + (Math.random() - 0.5) * 300,
                                fx: null,
                                fy: null,
                                pinned: false
                            };

                            this.nodes.push(node);
                            concept.nodeIds.push(nodeId);

                            // Add temporal link to previous node in same concept
                            if (prevNodeId) {
                                this.addLink(prevNodeId, nodeId, 'temporal', query);
                            }

                            prevNodeId = nodeId;
                        }

                        // Re-render as nodes stream in
                        this.render();
                    }
                } catch (e) {
                    console.error('Parse error:', e);
                }
            }
        }
    }

    generateNodeId(title, year) {
        const normalized = title.toLowerCase()
            .replace(/[^a-z0-9]/g, '_')
            .substring(0, 40);
        return `${normalized}_${year}`;
    }

    findCrossReference(title, year) {
        const titleLower = title.toLowerCase();
        return this.nodes.find(n => {
            const nTitleLower = n.title.toLowerCase();
            if (nTitleLower === titleLower && n.year === year) {
                return true;
            }
            if (n.year === year) {
                const words1 = new Set(titleLower.split(/\s+/).filter(w => w.length > 3));
                const words2 = new Set(nTitleLower.split(/\s+/).filter(w => w.length > 3));
                const intersection = [...words1].filter(w => words2.has(w));
                if (intersection.length >= 2) {
                    return true;
                }
            }
            return false;
        });
    }

    addLink(sourceId, targetId, type, conceptQuery) {
        // Avoid duplicate links
        const exists = this.links.some(l =>
            (l.source.id || l.source) === sourceId &&
            (l.target.id || l.target) === targetId
        );

        if (!exists && sourceId !== targetId) {
            this.links.push({
                source: sourceId,
                target: targetId,
                type: type,
                conceptQuery: conceptQuery
            });
        }
    }

    truncateTitle(title, maxLen = 25) {
        if (title.length <= maxLen) return title;
        return title.substring(0, maxLen - 3) + '...';
    }

    render() {
        // Hide empty state if we have nodes
        const emptyState = document.getElementById('network-empty');
        if (emptyState) {
            emptyState.style.display = this.nodes.length > 0 ? 'none' : 'flex';
        }

        // Filter visible nodes and links
        const visibleNodes = this.nodes.filter(n => {
            const concept = this.concepts.get(n.conceptQuery.toLowerCase());
            return concept && concept.visible;
        });

        const visibleNodeIds = new Set(visibleNodes.map(n => n.id));
        const visibleLinks = this.links.filter(l => {
            const sourceId = l.source.id || l.source;
            const targetId = l.target.id || l.target;
            return visibleNodeIds.has(sourceId) && visibleNodeIds.has(targetId);
        });

        // Update links
        this.linksGroup.selectAll('.network-link')
            .data(visibleLinks, d => `${d.source.id || d.source}-${d.target.id || d.target}`)
            .join(
                enter => enter.append('line')
                    .attr('class', d => `network-link ${d.type}`)
                    .attr('stroke', d => d.type === 'cross-concept' ? '#c44' : '#999')
                    .attr('stroke-width', d => d.type === 'cross-concept' ? 2.5 : 2)
                    .attr('stroke-dasharray', d => d.type === 'cross-concept' ? '8 4' : 'none')
                    .attr('marker-end', d => d.type === 'cross-concept' ? 'url(#arrowhead-cross)' : 'url(#arrowhead)')
                    .attr('opacity', 0)
                    .call(enter => enter.transition().duration(300).attr('opacity', 0.7)),
                update => update
                    .attr('stroke', d => d.type === 'cross-concept' ? '#c44' : '#999')
                    .attr('stroke-dasharray', d => d.type === 'cross-concept' ? '8 4' : 'none'),
                exit => exit.transition().duration(200).attr('opacity', 0).remove()
            );

        // Update nodes
        const self = this;
        this.nodesGroup.selectAll('.network-node-group')
            .data(visibleNodes, d => d.id)
            .join(
                enter => {
                    const g = enter.append('g')
                        .attr('class', 'network-node-group')
                        .attr('transform', d => `translate(${d.x},${d.y})`)
                        .attr('opacity', 0)
                        .call(this.drag())
                        .on('click', (event, d) => this.selectNode(d))
                        .on('mouseover', function(event, d) {
                            self.tooltip
                                .html(`<strong>${d.title}</strong><br><em>${d.year}</em><br>${d.claim ? d.claim.substring(0, 150) + '...' : ''}`)
                                .style('visibility', 'visible');
                            d3.select(this).select('circle').attr('r', 18);
                        })
                        .on('mousemove', function(event) {
                            self.tooltip
                                .style('top', (event.pageY - 10) + 'px')
                                .style('left', (event.pageX + 15) + 'px');
                        })
                        .on('mouseout', function(event, d) {
                            self.tooltip.style('visibility', 'hidden');
                            d3.select(this).select('circle').attr('r', 14);
                        });

                    // Node circle
                    g.append('circle')
                        .attr('class', 'network-node')
                        .attr('r', 14)
                        .attr('fill', d => d.color)
                        .attr('stroke', '#fff')
                        .attr('stroke-width', 2);

                    // Year label inside circle
                    g.append('text')
                        .attr('class', 'network-node-year')
                        .attr('dy', 4)
                        .attr('text-anchor', 'middle')
                        .attr('font-size', '9px')
                        .attr('font-weight', 'bold')
                        .attr('fill', '#fff')
                        .attr('pointer-events', 'none')
                        .text(d => d.year ? d.year.toString().slice(-2) : '');

                    // Title label below
                    g.append('text')
                        .attr('class', 'network-node-label')
                        .attr('dy', 30)
                        .attr('text-anchor', 'middle')
                        .attr('font-size', '10px')
                        .attr('fill', '#555')
                        .attr('pointer-events', 'none')
                        .text(d => this.truncateTitle(d.title, 20));

                    // Fade in
                    g.transition().duration(300).attr('opacity', 1);

                    return g;
                },
                update => update,
                exit => exit.transition().duration(200).attr('opacity', 0).remove()
            );

        // Update simulation
        this.simulation.nodes(visibleNodes);
        this.simulation.force('link').links(visibleLinks);
        this.simulation.alpha(0.5).restart();
    }

    drag() {
        return d3.drag()
            .on('start', (event, d) => {
                if (!event.active) this.simulation.alphaTarget(0.3).restart();
                d.fx = d.x;
                d.fy = d.y;
            })
            .on('drag', (event, d) => {
                d.fx = event.x;
                d.fy = event.y;
            })
            .on('end', (event, d) => {
                if (!event.active) this.simulation.alphaTarget(0);
                if (!d.pinned) {
                    d.fx = null;
                    d.fy = null;
                }
            });
    }

    selectNode(node) {
        this.selectedNode = node;

        // Update visual selection
        this.nodesGroup.selectAll('.network-node')
            .classed('selected', d => d.id === node.id)
            .attr('stroke', d => d.id === node.id ? '#000' : '#fff')
            .attr('stroke-width', d => d.id === node.id ? 3 : 2);

        // Update detail panel
        const placeholder = document.querySelector('.detail-placeholder');
        const content = document.getElementById('detail-content');

        if (placeholder) placeholder.style.display = 'none';
        if (content) content.style.display = 'block';

        document.getElementById('detail-title').textContent = node.title;
        document.getElementById('detail-year').textContent = node.year;
        document.getElementById('detail-claim').textContent = node.claim || 'No description available';
        document.getElementById('detail-concept').textContent = `Traced from: "${node.conceptQuery}"`;
        document.getElementById('detail-source').href = node.url || '#';
        document.getElementById('detail-pin').textContent = node.pinned ? 'Unpin' : 'Pin';
    }

    togglePin(nodeId) {
        const node = nodeId ? this.nodes.find(n => n.id === nodeId) : this.selectedNode;
        if (node) {
            node.pinned = !node.pinned;
            if (!node.pinned) {
                node.fx = null;
                node.fy = null;
            } else {
                node.fx = node.x;
                node.fy = node.y;
            }

            if (this.selectedNode && this.selectedNode.id === node.id) {
                document.getElementById('detail-pin').textContent = node.pinned ? 'Unpin' : 'Pin';
            }

            this.simulation.alpha(0.1).restart();
        }
    }

    traceFromNode() {
        if (this.selectedNode) {
            this.addConcept(this.selectedNode.title);
        }
    }

    toggleConcept(query, visible) {
        const concept = this.concepts.get(query.toLowerCase());
        if (concept) {
            concept.visible = visible;
            this.render();
            this.saveState();
        }
    }

    removeConcept(query) {
        const concept = this.concepts.get(query.toLowerCase());
        if (concept) {
            this.nodes = this.nodes.filter(n => n.conceptQuery.toLowerCase() !== query.toLowerCase());
            this.links = this.links.filter(l => {
                const sourceNode = this.nodes.find(n => n.id === (l.source.id || l.source));
                const targetNode = this.nodes.find(n => n.id === (l.target.id || l.target));
                return sourceNode && targetNode;
            });
            this.concepts.delete(query.toLowerCase());
            this.render();
            this.saveState();
            this.updateUI();
        }
    }

    clearAll() {
        this.nodes = [];
        this.links = [];
        this.concepts.clear();
        this.selectedNode = null;

        sessionStorage.removeItem('genealogy_network');

        this.render();
        this.updateUI();

        const placeholder = document.querySelector('.detail-placeholder');
        const content = document.getElementById('detail-content');
        if (placeholder) placeholder.style.display = 'block';
        if (content) content.style.display = 'none';
    }

    saveState() {
        const state = {
            nodes: this.nodes.map(n => ({
                id: n.id,
                title: n.title,
                year: n.year,
                url: n.url,
                claim: n.claim,
                conceptQuery: n.conceptQuery,
                position: n.position,
                color: n.color,
                x: n.x,
                y: n.y,
                pinned: n.pinned
            })),
            links: this.links.map(l => ({
                source: l.source.id || l.source,
                target: l.target.id || l.target,
                type: l.type,
                conceptQuery: l.conceptQuery
            })),
            concepts: Array.from(this.concepts.entries())
        };
        sessionStorage.setItem('genealogy_network', JSON.stringify(state));
    }

    loadState() {
        // First check for pending trace from try.html
        const pending = sessionStorage.getItem('pending_network_trace');
        if (pending) {
            sessionStorage.removeItem('pending_network_trace');
            const data = JSON.parse(pending);
            this.importGenealogy(data.query, data.items);
            return;
        }

        // Otherwise load saved state
        const saved = sessionStorage.getItem('genealogy_network');
        if (saved) {
            try {
                const state = JSON.parse(saved);
                this.nodes = state.nodes || [];
                this.links = state.links || [];
                this.concepts = new Map(state.concepts || []);
                this.render();
            } catch (e) {
                console.error('Error loading state:', e);
            }
        }
    }

    importGenealogy(query, items) {
        if (!items || items.length === 0) return;

        const color = this.colorPalette[this.concepts.size % this.colorPalette.length];

        this.concepts.set(query.toLowerCase(), {
            query: query,
            color: color,
            nodeIds: [],
            visible: true
        });

        const concept = this.concepts.get(query.toLowerCase());
        let prevNodeId = null;

        items.forEach((item, index) => {
            const nodeId = this.generateNodeId(item.title, item.year);

            const node = {
                id: nodeId,
                title: item.title,
                year: item.year,
                url: item.url,
                claim: item.claim,
                conceptQuery: query,
                position: index + 1,
                color: color,
                x: this.width / 2 + (Math.random() - 0.5) * 300,
                y: this.height / 2 + (Math.random() - 0.5) * 300,
                fx: null,
                fy: null,
                pinned: false
            };

            this.nodes.push(node);
            concept.nodeIds.push(nodeId);

            if (prevNodeId) {
                this.addLink(prevNodeId, nodeId, 'temporal', query);
            }
            prevNodeId = nodeId;
        });

        this.render();
        this.saveState();
        this.updateUI();
    }

    updateUI() {
        const list = document.getElementById('concept-list');
        if (!list) return;

        if (this.concepts.size === 0) {
            list.innerHTML = '<li class="concept-list-empty">No concepts traced yet</li>';
            return;
        }

        list.innerHTML = '';

        this.concepts.forEach((concept, key) => {
            const li = document.createElement('li');
            li.className = 'concept-list-item';
            li.innerHTML = `
                <input type="checkbox" ${concept.visible ? 'checked' : ''}
                       onchange="network.toggleConcept('${key}', this.checked)">
                <span class="concept-color-dot" style="background: ${concept.color}"></span>
                <span class="concept-name">${concept.query}</span>
                <button class="concept-remove" onclick="network.removeConcept('${key}')" title="Remove">x</button>
            `;
            list.appendChild(li);
        });
    }

    showLoading(show) {
        const loading = document.getElementById('network-loading');
        if (loading) {
            loading.style.display = show ? 'flex' : 'none';
        }
    }

    exportPNG() {
        const svgElement = this.svg.node();
        const svgData = new XMLSerializer().serializeToString(svgElement);

        const canvas = document.createElement('canvas');
        canvas.width = this.width * 2;
        canvas.height = this.height * 2;
        const ctx = canvas.getContext('2d');

        const img = new Image();
        img.onload = () => {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            const link = document.createElement('a');
            link.download = 'genealogy-network.png';
            link.href = canvas.toDataURL('image/png');
            link.click();
        };

        img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
    }
}

// Initialize on page load
let network;

document.addEventListener('DOMContentLoaded', () => {
    network = new GenealogyNetwork('network-canvas');

    // Add concept form
    const form = document.getElementById('add-concept-form');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const input = document.getElementById('concept-input');
            if (input && input.value.trim()) {
                network.addConcept(input.value.trim());
                input.value = '';
            }
        });
    }

    // Detail panel buttons
    document.getElementById('detail-trace')?.addEventListener('click', () => {
        network.traceFromNode();
    });

    document.getElementById('detail-pin')?.addEventListener('click', () => {
        network.togglePin();
    });

    // Action buttons
    document.getElementById('clear-btn')?.addEventListener('click', () => {
        if (confirm('Clear all concepts from the network?')) {
            network.clearAll();
        }
    });

    document.getElementById('export-btn')?.addEventListener('click', () => {
        network.exportPNG();
    });
});
