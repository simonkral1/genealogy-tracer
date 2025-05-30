document.addEventListener('DOMContentLoaded', function () {
  console.log('Graph view DOM loaded');
  
  const loadingDiv = document.getElementById('loading-state');
  const errorDiv = document.getElementById('error-state');
  const graphContainer = document.getElementById('graph-container');
  const tooltip = document.getElementById('tooltip');
  const resetViewBtn = document.getElementById('reset-view');
  const expandAllBtn = document.getElementById('expand-all');
  
  console.log('Graph view elements found:', {
    loadingDiv: !!loadingDiv,
    errorDiv: !!errorDiv,
    graphContainer: !!graphContainer,
    tooltip: !!tooltip,
    resetViewBtn: !!resetViewBtn,
    expandAllBtn: !!expandAllBtn
  });

  let simulation;
  let svg;
  let graphData = { nodes: [], links: [] };
  let allNodes = new Map(); // Store all nodes including unexpanded ones
  let expandedNodes = new Set(); // Track which nodes have been expanded

  // Initialize the graph
  async function initializeGraph() {
    console.log('Starting graph initialization...');
    
    try {
      // Check if chrome APIs are available
      if (typeof chrome === 'undefined' || !chrome.storage) {
        console.error('Chrome storage API not available');
        showError('Chrome extension API not available');
        return;
      }
      
      // Check if D3 is available
      if (typeof d3 === 'undefined') {
        console.error('D3.js is not available');
        showError('D3.js library failed to load');
        return;
      }
      
      console.log('D3.js is available, getting storage data...');
      
      // Get data from chrome storage with a timeout
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Storage timeout')), 5000)
      );
      
      const storagePromise = chrome.storage.local.get(['graphViewData']);
      const result = await Promise.race([storagePromise, timeoutPromise]);
      
      console.log('Storage result:', result);
      
      if (!result.graphViewData) {
        console.error('No graph data found in storage');
        // Try to get all storage to debug
        const allData = await chrome.storage.local.get(null);
        console.log('All storage data:', allData);
        showError('No graph data found - try opening graph view again');
        return;
      }

      const data = result.graphViewData;
      console.log('Graph data loaded:', data);
      
      // Validate data structure
      if (!data.rootTerm && (!data.items || data.items.length === 0)) {
        console.error('Invalid graph data structure:', data);
        showError('Invalid graph data - no root term or items');
        return;
      }

      // Transform genealogy data into graph format
      console.log('Transforming data to graph format...');
      transformDataToGraph(data);
      
      // Create the D3 visualization
      console.log('Creating visualization...');
      createVisualization();
      
      console.log('Graph initialization complete');
      hideLoading();
    } catch (error) {
      console.error('Error initializing graph:', error);
      showError('Failed to load graph data: ' + error.message);
    }
  }

  function transformDataToGraph(data) {
    console.log('Transforming data:', data);
    const nodes = [];
    const links = [];
    
    // Create root node for the main search term
    const rootNode = {
      id: data.rootTerm || 'Unknown',
      label: data.rootTerm || 'Unknown',
      type: 'root',
      x: 0,
      y: 0,
      fixed: true
    };
    nodes.push(rootNode);
    allNodes.set(rootNode.id, rootNode);
    console.log('Created root node:', rootNode);

    // Add genealogy items as nodes
    if (data.items && data.items.length > 0) {
      data.items.forEach((item, index) => {
        const nodeId = `${item.title}_${index}`;
        const node = {
          id: nodeId,
          label: item.title,
          type: 'genealogy',
          year: item.year,
          claim: item.claim,
          url: item.url,
          expandable: true
        };
        nodes.push(node);
        allNodes.set(nodeId, node);
        
        // Create link from root to this genealogy item
        links.push({
          source: data.rootTerm,
          target: nodeId,
          type: 'genealogy'
        });
      });
    }

    // Add questions as nodes if available
    if (data.questions && data.questions.length > 0) {
      data.questions.forEach((question, index) => {
        const nodeId = `question_${index}`;
        const node = {
          id: nodeId,
          label: question.length > 30 ? question.substring(0, 30) + '...' : question,
          fullText: question,
          type: 'question'
        };
        nodes.push(node);
        allNodes.set(nodeId, node);
        
        // Create link from root to this question
        links.push({
          source: data.rootTerm,
          target: nodeId,
          type: 'question'
        });
      });
    }

    graphData = { nodes, links };
    console.log('Transformed graph data:', graphData);
    console.log('Total nodes:', nodes.length, 'Total links:', links.length);
  }

  function createVisualization() {
    // Clear any existing visualization
    d3.select('#graph-container svg').remove();

    const container = d3.select('#graph-container');
    const containerRect = container.node().getBoundingClientRect();
    const width = containerRect.width;
    const height = containerRect.height;

    // Create SVG
    svg = container
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .call(d3.zoom()
        .scaleExtent([0.1, 4])
        .on('zoom', (event) => {
          g.attr('transform', event.transform);
        }));

    const g = svg.append('g');

    // Create simulation
    simulation = d3.forceSimulation(graphData.nodes)
      .force('link', d3.forceLink(graphData.links).id(d => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(30));

    // Create links
    const link = g.append('g')
      .selectAll('line')
      .data(graphData.links)
      .enter().append('line')
      .attr('class', 'link');

    // Create nodes
    const node = g.append('g')
      .selectAll('circle')
      .data(graphData.nodes)
      .enter().append('circle')
      .attr('class', d => `node ${d.type} ${d.expandable ? 'expandable' : ''}`)
      .attr('r', d => d.type === 'root' ? 15 : 10)
      .style('cursor', d => d.expandable && d.type === 'genealogy' ? 'pointer' : 'default')
      .call(d3.drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended))
      .on('click', function(event, d) {
        console.log('Node clicked in D3 handler:', d.label, d.type, d.expandable);
        handleNodeClick(event, d);
      })
      .on('mouseover', handleMouseOver)
      .on('mouseout', handleMouseOut);

    // Create labels
    const label = g.append('g')
      .selectAll('text')
      .data(graphData.nodes)
      .enter().append('text')
      .attr('class', 'node-label')
      .attr('dy', d => d.type === 'root' ? 25 : 20)
      .text(d => d.label);

    // Update positions on simulation tick
    simulation.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

      node
        .attr('cx', d => d.x)
        .attr('cy', d => d.y);

      label
        .attr('x', d => d.x)
        .attr('y', d => d.y);
    });

    // Store references for updates
    svg.selectAll('.link-group').data([]).exit().remove();
    svg.selectAll('.node-group').data([]).exit().remove();
    svg.selectAll('.label-group').data([]).exit().remove();
    
    svg.link = link;
    svg.node = node;
    svg.label = label;
    svg.g = g;
  }

  function handleNodeClick(event, d) {
    console.log('handleNodeClick called:', d.label, 'Type:', d.type, 'Expandable:', d.expandable, 'Was dragged:', d.wasDragged);
    
    // Prevent click if this was actually a drag
    if (d.wasDragged) {
      console.log('Ignoring click - was drag operation');
      return;
    }
    
    event.stopPropagation();
    
    console.log('Processing click for:', d.label, 'Already expanded:', expandedNodes.has(d.id));
    
    if (d.expandable && d.type === 'genealogy' && !expandedNodes.has(d.id)) {
      console.log('Expanding node:', d.label);
      // Add visual feedback
      d3.select(event.target).classed('expanding', true);
      expandNode(d, event);
    } else if (expandedNodes.has(d.id)) {
      // Node already expanded, show tooltip
      console.log('Node already expanded:', d.label);
      showTooltip(event, `${d.label} already expanded\nClick linked nodes to explore further`);
      setTimeout(hideTooltip, 2000);
    } else if (d.type === 'genealogy' && d.url && d.url !== 'N/A' && d.url !== 'none') {
      // Open URL if available
      console.log('Opening URL for:', d.label, d.url);
      showTooltip(event, `Opening source: ${d.url}`);
      setTimeout(hideTooltip, 1000);
      window.open(d.url.startsWith('http') ? d.url : '//' + d.url, '_blank');
    } else if (d.type === 'root') {
      // Root node clicked, show info
      console.log('Root node clicked:', d.label);
      showTooltip(event, `Root concept: ${d.label}\nClick green nodes to expand genealogy`);
      setTimeout(hideTooltip, 3000);
    } else if (d.type === 'question') {
      // Question node clicked, show full text
      console.log('Question node clicked:', d.label);
      showTooltip(event, d.fullText || d.label);
      setTimeout(hideTooltip, 4000);
    } else {
      console.log('Unhandled click case for:', d.label, d.type, 'expandable:', d.expandable);
    }
  }

  async function expandNode(node, event) {
    if (expandedNodes.has(node.id)) return;
    
    console.log('Expanding node:', node.label);
    expandedNodes.add(node.id);
    
    try {
      // Show loading state for this node
      if (event) {
        showTooltip(event, `Loading genealogy for "${node.label}"...\nThis may take a few seconds`);
      }
      
      // Perform trace for this node
      console.log('Fetching genealogy for:', node.label);
      const response = await fetch('https://red-heart-d66e.simon-kral99.workers.dev/trace', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: node.label
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const traceText = await response.text();
      console.log('Received trace response for:', node.label);
      console.log('Raw response:', traceText.substring(0, 500) + '...');
      
      // Parse the response and add new nodes
      const newNodes = parseTraceResponse(traceText, node);
      console.log('Parsed', newNodes.length, 'new nodes for', node.label);
      
      if (newNodes.length === 0) {
        console.log('No nodes parsed. Raw response was:', traceText);
      }
      
      if (newNodes.length > 0) {
        addNodesToGraph(newNodes, node);
        updateVisualization();
        
        // Show success feedback
        if (event) {
          showTooltip(event, `Added ${newNodes.length} related concepts to "${node.label}"`);
          setTimeout(hideTooltip, 2000);
        }
      } else {
        // No new nodes found
        if (event) {
          showTooltip(event, `No additional genealogy found for "${node.label}"`);
          setTimeout(hideTooltip, 2000);
        }
      }
      
      // Remove expanding animation
      svg.selectAll('.node').classed('expanding', false);
      
    } catch (error) {
      console.error('Error expanding node:', error);
      expandedNodes.delete(node.id); // Allow retry
      
      // Remove expanding animation
      svg.selectAll('.node').classed('expanding', false);
      
      if (event) {
        showTooltip(event, `Failed to expand "${node.label}": ${error.message}\nClick to try again`);
        setTimeout(hideTooltip, 3000);
      }
    }
  }

  function parseTraceResponse(traceText, parentNode) {
    console.log('Parsing trace response for parent:', parentNode.label);
    const lines = traceText.split('\n');
    // Updated regex to handle double square brackets [[URL]]
    const itemRegex = /^(.*?)\s\(([^)]+)\)\s\[\[([^\]]+)\]\]\s—\s(.+)$/;
    const newNodes = [];
    let parsedLines = 0;
    let matchedLines = 0;
    
    lines.forEach((line, index) => {
      line = line.trim();
      if (!line) return;
      
      parsedLines++;
      console.log(`Line ${index}: "${line}"`);
      
      const match = line.match(itemRegex);
      if (match) {
        matchedLines++;
        const [, title, year, url, claim] = match;
        console.log('Matched:', { title, year, url, claim });
        
        const nodeId = `${parentNode.id}_${title.replace(/\s+/g, '_')}_${index}`;
        
        // Don't add if this node already exists by title (more flexible check)
        const existingNode = Array.from(allNodes.values()).find(n => 
          n.label === title && n.type === 'genealogy'
        );
        if (existingNode) {
          console.log('Node already exists:', title);
          return;
        }
        
        const newNode = {
          id: nodeId,
          label: title,
          type: 'genealogy',
          year: year,
          claim: claim,
          url: url,
          expandable: true,
          parent: parentNode.id
        };
        
        newNodes.push(newNode);
        allNodes.set(nodeId, newNode);
        console.log('Added new node:', newNode.label);
      } else {
        console.log('Line did not match regex:', line);
        
        // Try alternative parsing for different formats
        if (line.includes('(') && line.includes(')') && line.includes('—')) {
          console.log('Potential genealogy item with different format');
        }
      }
    });
    
    console.log(`Parsing summary: ${parsedLines} lines processed, ${matchedLines} matched, ${newNodes.length} new nodes created`);
    return newNodes;
  }

  function addNodesToGraph(newNodes, parentNode) {
    // Add new nodes to the data
    graphData.nodes.push(...newNodes);
    
    // Create links from parent to new nodes
    newNodes.forEach(node => {
      const link = {
        source: parentNode.id,
        target: node.id,
        type: 'expansion'
      };
      graphData.links.push(link);
      console.log('Created link from', parentNode.label, 'to', node.label);
    });
    
    console.log('Added', newNodes.length, 'new nodes and', newNodes.length, 'new links to graph');
    console.log('Total nodes:', graphData.nodes.length, 'Total links:', graphData.links.length);
  }

  function updateVisualization() {
    if (!svg || !simulation) return;
    
    const g = svg.g;
    
    // Update links
    const link = g.selectAll('.link')
      .data(graphData.links, d => `${d.source.id || d.source}-${d.target.id || d.target}`);
    
    const linkEnter = link.enter()
      .append('line')
      .attr('class', 'link');
    
    link.merge(linkEnter);
    link.exit().remove();
    
    // Update nodes
    const node = g.selectAll('.node')
      .data(graphData.nodes, d => d.id);
    
    const nodeEnter = node.enter()
      .append('circle')
      .attr('class', d => `node ${d.type} ${d.expandable ? 'expandable' : ''}`)
      .attr('r', d => d.type === 'root' ? 15 : 10)
      .style('cursor', d => d.expandable && d.type === 'genealogy' ? 'pointer' : 'default')
      .call(d3.drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended))
      .on('click', function(event, d) {
        console.log('Node clicked in D3 handler:', d.label, d.type, d.expandable);
        handleNodeClick(event, d);
      })
      .on('mouseover', handleMouseOver)
      .on('mouseout', handleMouseOut);
    
    // Set initial positions for new nodes near their parent
    nodeEnter.each(function(d) {
      if (d.parent) {
        const parentNode = allNodes.get(d.parent);
        if (parentNode) {
          // Position new nodes near their parent with some randomness
          const angle = Math.random() * 2 * Math.PI;
          const distance = 80 + Math.random() * 40;
          d.x = (parentNode.x || 0) + Math.cos(angle) * distance;
          d.y = (parentNode.y || 0) + Math.sin(angle) * distance;
        }
      }
    });
    
    node.merge(nodeEnter);
    node.exit().remove();
    
    // Update labels
    const label = g.selectAll('.node-label')
      .data(graphData.nodes, d => d.id);
    
    const labelEnter = label.enter()
      .append('text')
      .attr('class', 'node-label')
      .attr('dy', d => d.type === 'root' ? 25 : 20)
      .text(d => d.label);
    
    label.merge(labelEnter);
    label.exit().remove();
    
    // Update simulation with new data
    simulation.nodes(graphData.nodes);
    simulation.force('link').links(graphData.links);
    
    // Restart simulation with higher energy for new nodes
    simulation.alpha(0.8).alphaTarget(0.1).restart();
    
    // Reset alpha target after a delay
    setTimeout(() => {
      simulation.alphaTarget(0);
    }, 1000);
    
    // Update tick function to handle new nodes
    simulation.on('tick', () => {
      g.selectAll('.link')
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

      g.selectAll('.node')
        .attr('cx', d => d.x)
        .attr('cy', d => d.y);

      g.selectAll('.node-label')
        .attr('x', d => d.x)
        .attr('y', d => d.y);
    });
    
    // Store updated references
    svg.link = g.selectAll('.link');
    svg.node = g.selectAll('.node');
    svg.label = g.selectAll('.node-label');
    
    console.log('Updated visualization with', graphData.nodes.length, 'nodes and', graphData.links.length, 'links');
  }

  function handleMouseOver(event, d) {
    let tooltipText = '';
    
    if (d.type === 'root') {
      tooltipText = `🔵 ROOT: ${d.label}\nClick green genealogy nodes to explore connections`;
    } else if (d.type === 'question') {
      tooltipText = `🟠 QUESTION: ${d.fullText || d.label}\nClick to see full question`;
    } else if (d.type === 'genealogy') {
      const expandInfo = d.expandable && !expandedNodes.has(d.id) ? 
        '\n\n🖱️ Click to explore genealogy of this concept' : 
        expandedNodes.has(d.id) ? '\n\n✅ Already explored' : '';
      
      tooltipText = `🟢 GENEALOGY: ${d.label} (${d.year})\n${d.claim}`;
      if (d.url && d.url !== 'N/A' && d.url !== 'none') {
        tooltipText += `\n\n🔗 Source: ${d.url}`;
      }
      tooltipText += expandInfo;
    } else {
      tooltipText = d.label;
    }
    
    showTooltip(event, tooltipText);
  }

  function handleMouseOut() {
    hideTooltip();
  }

  function showTooltip(event, text) {
    const tooltipElement = d3.select('#tooltip');
    if (tooltipElement.empty()) {
      console.error('Tooltip element not found');
      return;
    }
    tooltipElement
      .style('opacity', 1)
      .style('left', (event.pageX + 10) + 'px')
      .style('top', (event.pageY - 10) + 'px')
      .html(text.replace(/\n/g, '<br>'));
  }

  function hideTooltip() {
    const tooltipElement = d3.select('#tooltip');
    if (!tooltipElement.empty()) {
      tooltipElement.style('opacity', 0);
    }
  }

  function dragstarted(event, d) {
    console.log('Drag started on:', d.label);
    d.dragStarted = true;
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }

  function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
    d.wasDragged = true;
  }

  function dragended(event, d) {
    console.log('Drag ended on:', d.label, 'was dragged:', d.wasDragged);
    if (!event.active) simulation.alphaTarget(0);
    if (!d.fixed) {
      d.fx = null;
      d.fy = null;
    }
    // Reset drag flags after a small delay to prevent click interference
    setTimeout(() => {
      d.dragStarted = false;
      d.wasDragged = false;
    }, 100);
  }

  function resetView() {
    if (!svg) return;
    
    svg.transition()
      .duration(750)
      .call(
        d3.zoom().transform,
        d3.zoomIdentity
      );
  }

  async function expandAll() {
    const expandableNodes = graphData.nodes.filter(n => 
      n.expandable && n.type === 'genealogy' && !expandedNodes.has(n.id)
    );
    
    if (expandableNodes.length === 0) {
      showTooltip({ pageX: 400, pageY: 300 }, 'No more nodes to expand');
      setTimeout(hideTooltip, 2000);
      return;
    }
    
    expandAllBtn.textContent = 'Expanding...';
    expandAllBtn.disabled = true;
    
    for (const node of expandableNodes.slice(0, 3)) { // Limit to 3 to avoid overwhelming
      await expandNode(node);
      await new Promise(resolve => setTimeout(resolve, 500)); // Small delay between expansions
    }
    
    expandAllBtn.textContent = 'Expand All';
    expandAllBtn.disabled = false;
  }

  function showError(message) {
    loadingDiv.style.display = 'none';
    errorDiv.style.display = 'block';
    errorDiv.querySelector('p').textContent = message;
  }

  function hideLoading() {
    loadingDiv.style.display = 'none';
  }

  // Event listeners
  resetViewBtn.addEventListener('click', resetView);
  expandAllBtn.addEventListener('click', expandAll);

  // Initialize
  initializeGraph();
});