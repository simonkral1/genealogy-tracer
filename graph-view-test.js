// Test version of graph-view.js for standalone testing
const loadingDiv = document.getElementById('loading-state');
const errorDiv = document.getElementById('error-state');
const graphContainer = document.getElementById('graph-container');
const tooltip = document.getElementById('tooltip');

let simulation;
let svg;
let graphData = { nodes: [], links: [] };
let allNodes = new Map();
let expandedNodes = new Set();

function updateStatus(message) {
  document.getElementById('status').textContent = new Date().toLocaleTimeString() + ': ' + message;
}

// Initialize the graph (test version)
async function initializeGraphTest() {
  updateStatus('Starting graph initialization...');
  
  try {
    // Check if D3 is available
    if (typeof d3 === 'undefined') {
      updateStatus('ERROR: D3.js is not available');
      showError('D3.js library failed to load');
      return;
    }
    
    updateStatus('D3.js is available, getting test data...');
    
    // Get data from mock chrome storage
    const result = await chrome.storage.local.get(['graphViewData']);
    updateStatus('Storage result: ' + JSON.stringify(result, null, 2));
    
    if (!result.graphViewData) {
      updateStatus('ERROR: No graph data found in storage');
      showError('No graph data found - click "Load Test Data" first');
      return;
    }

    const data = result.graphViewData;
    updateStatus('Graph data loaded: ' + JSON.stringify(data, null, 2));

    // Transform genealogy data into graph format
    updateStatus('Transforming data to graph format...');
    transformDataToGraph(data);
    
    // Create the D3 visualization
    updateStatus('Creating visualization...');
    createVisualization();
    
    updateStatus('Graph initialization complete');
    hideLoading();
  } catch (error) {
    updateStatus('ERROR: ' + error.message);
    showError('Failed to load graph data: ' + error.message);
  }
}

function transformDataToGraph(data) {
  updateStatus('Transforming data: ' + JSON.stringify(data));
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
  updateStatus('Created root node: ' + rootNode.label);

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
    updateStatus('Added ' + data.items.length + ' genealogy nodes');
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
    updateStatus('Added ' + data.questions.length + ' question nodes');
  }

  graphData = { nodes, links };
  updateStatus('Transformed graph data - Nodes: ' + nodes.length + ', Links: ' + links.length);
}

function createVisualization() {
  updateStatus('Creating D3 visualization...');
  
  // Clear any existing visualization
  d3.select('#graph-container svg').remove();

  const container = d3.select('#graph-container');
  const containerRect = container.node().getBoundingClientRect();
  const width = containerRect.width;
  const height = containerRect.height;

  updateStatus('Container size: ' + width + 'x' + height);

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
    .call(d3.drag()
      .on('start', dragstarted)
      .on('drag', dragged)
      .on('end', dragended))
    .on('click', handleNodeClick)
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

  svg.g = g;
  updateStatus('D3 visualization created successfully');
}

function handleNodeClick(event, d) {
  event.stopPropagation();
  updateStatus('Node clicked: ' + d.label + ' (type: ' + d.type + ')');
  
  if (d.type === 'genealogy' && d.url && d.url !== 'N/A' && d.url !== 'none') {
    updateStatus('Opening URL: ' + d.url);
    window.open(d.url.startsWith('http') ? d.url : '//' + d.url, '_blank');
  }
}

function handleMouseOver(event, d) {
  const tooltipText = d.type === 'question' && d.fullText ? d.fullText :
                    d.type === 'genealogy' ? `${d.label} (${d.year})\n${d.claim}` :
                    d.label;
  showTooltip(event, tooltipText);
}

function handleMouseOut() {
  hideTooltip();
}

function showTooltip(event, text) {
  tooltip
    .style('opacity', 1)
    .style('left', (event.pageX + 10) + 'px')
    .style('top', (event.pageY - 10) + 'px')
    .html(text.replace(/\n/g, '<br>'));
}

function hideTooltip() {
  tooltip.style('opacity', 0);
}

function dragstarted(event, d) {
  if (!event.active) simulation.alphaTarget(0.3).restart();
  d.fx = d.x;
  d.fy = d.y;
}

function dragged(event, d) {
  d.fx = event.x;
  d.fy = event.y;
}

function dragended(event, d) {
  if (!event.active) simulation.alphaTarget(0);
  if (!d.fixed) {
    d.fx = null;
    d.fy = null;
  }
}

function showError(message) {
  loadingDiv.style.display = 'none';
  errorDiv.style.display = 'block';
  errorDiv.querySelector('p').textContent = message;
}

function hideLoading() {
  loadingDiv.style.display = 'none';
}

// Make the test function globally available
window.initializeGraphTest = initializeGraphTest;
updateStatus('Graph test script loaded and ready');