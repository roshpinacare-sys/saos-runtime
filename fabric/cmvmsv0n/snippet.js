import { loadJSON } from './utils.js';

// Load node list and current status
const nodeList = loadJSON('./blurt-nodes.json');
const nodeStatus = loadJSON('./state/grid-status.json');

// Performance history for each node
const performanceHistory = new Map();

// Load performance history from learning directory
const fs = await import('fs');
const path = await import('path');
const learningDir = './learning';

for (const file of fs.readdirSync(learningDir)) {
  if (file.startsWith('evolution-')) {
    const data = loadJSON(path.join(learningDir, file));
    if (data && data.runs && data.runs['saos-runtime']) {
      // Process performance data
      const runs = data.runs['saos-runtime'];
      
      // Update performance history for each node
      Object.entries(runs.hist || {}).forEach(([status, count]) => {
        if (status !== 'in_progress' && status !== 'pending') {
          // Simple scoring: success = 1, failure = -1, cancelled = 0
          const score = status === 'success' ? 1 : (status === 'failure' ? -1 : 0);
          
          // For simplicity, we'll apply this score to all nodes
          // In a real implementation, we'd track per-node performance
          nodeList.nodes.forEach(node => {
            if (!performanceHistory.has(node)) {
              performanceHistory.set(node, { scores: [], avgScore: 0 });
            }
            
            const history = performanceHistory.get(node);
            history.scores.push(score);
            
            // Keep only last 100 scores
            if (history.scores.length > 100) {
              history.scores.shift();
            }
            
            // Calculate average score
            history.avgScore = history.scores.reduce((a, b) => a + b, 0) / history.scores.length;
          });
        }
      });
    }
  }
}

// Load current load information
const currentLoad = loadJSON('./state/watchdog-actions.json');

// Load request types and their resource requirements
const requestTypes = {
  'revival': { cpu: 0.7, memory: 0.5, io: 0.3 },
  'probe': { cpu: 0.3, memory: 0.2, io: 0.1 },
  'digest': { cpu: 0.5, memory: 0.4, io: 0.6 },
  'sync': { cpu: 0.4, memory: 0.3, io: 0.8 }
};

// Predictive load balancer class
class PredictiveLoadBalancer {
  constructor(nodes, performanceHistory, currentLoad, requestTypes) {
    this.nodes = nodes;
    this.performanceHistory = performanceHistory;
    this.currentLoad = currentLoad;
    this.requestTypes = requestTypes;
    
    // Node availability status
    this.nodeAvailability = new Map();
    
    // Initialize node availability
    this.nodes.forEach(node => {
      this.nodeAvailability.set(node, {
        available: true,
        currentLoad: 0,
        predictedLoad: 0,
        healthScore: 0
      });
    });
    
    // Update current load from watchdog actions
    this.updateCurrentLoad();
    
    // Calculate health scores
    this.calculateHealthScores();
  }
  
  updateCurrentLoad() {
    // In a real implementation, this would fetch real-time metrics
    // For now, we'll simulate based on the watchdog actions
    if (this.currentLoad && this.currentLoad.actions) {
      this.currentLoad.actions.forEach(action => {
        if (action.node && this.nodeAvailability.has(action.node)) {
          const nodeInfo = this.nodeAvailability.get(action.node);
          nodeInfo.currentLoad += this.getRequestLoad(action.type);
        }
      });
    }
  }
  
  getRequestLoad(requestType) {
    // Simulate load based on request type
    if (this.requestTypes[requestType]) {
      // Calculate a composite load score
      const req = this.requestTypes[requestType];
      return (req.cpu + req.memory + req.io) / 3;
    }
    return 0.5; // Default load
  }
  
  calculateHealthScores() {
    this.nodes.forEach(node => {
      const nodeInfo = this.nodeAvailability.get(node);
      const perfHistory = this.performanceHistory.get(node);
      
      if (perfHistory) {
        // Performance score (0-1, higher is better)
        const perfScore = (perfHistory.avgScore + 1) / 2; // Normalize -1 to 1 to 0 to 1
        
        // Load score (0-1, lower load is better)
        const loadScore = Math.max(0, 1 - nodeInfo.currentLoad);
        
        // Combine scores with weights
        nodeInfo.healthScore = 0.7 * perfScore + 0.3 * loadScore;
      } else {
        // No performance history, default to load-based score
        nodeInfo.healthScore = Math.max(0, 1 - nodeInfo.currentLoad);
      }
    });
  }
  
  predictFutureLoad(node, timeWindowMinutes = 60) {
    // In a real implementation, this would use historical patterns and current trends
    // For now, we'll simulate a simple prediction based on current load
    const nodeInfo = this.nodeAvailability.get(node);
    
    // Simple prediction: assume current load continues with some random fluctuation
    const baseLoad = nodeInfo.currentLoad;
    const fluctuation = (Math.random() - 0.5) * 0.2; // ±10% fluctuation
    
    return Math.min(1, Math.max(0, baseLoad + fluctuation));
  }
  
  selectNode(requestType) {
    // Get request load requirements
    const reqLoad = this.getRequestLoad(requestType);
    
    // Filter available nodes
    const availableNodes = this.nodes.filter(node => {
      const nodeInfo = this.nodeAvailability.get(node);
      return nodeInfo.available && 
             (nodeInfo.currentLoad + reqLoad) <= 0.9; // Don't exceed 90% capacity
    });
    
    if (availableNodes.length === 0) {
      // No available nodes that can handle this request
      // Fall back to least loaded node
      return this.nodes.reduce((best, node) => {
        const nodeInfo = this.nodeAvailability.get(node);
        const bestInfo = this.nodeAvailability.get(best);
        return nodeInfo.currentLoad < bestInfo.currentLoad ? node : best;
      });
    }
    
    // Score each node based on multiple factors
    const scoredNodes = availableNodes.map(node => {
      const nodeInfo = this.nodeAvailability.get(node);
      const predictedLoad = this.predictFutureLoad(node);
      
      // Calculate a selection score (higher is better)
      // We want to balance load, performance, and avoid predicted bottlenecks
      const loadBalanceScore = 1 - predictedLoad;
      const performanceScore = nodeInfo.healthScore;
      const diversityScore = this.calculateDiversityScore(node, requestType);
      
      // Combine scores with weights
      const totalScore = (
        0.5 * loadBalanceScore +
        0.3 * performanceScore +
        0.2 * diversityScore
      );
      
      return {
        node,
        score: totalScore,
        predictedLoad,
        currentLoad: nodeInfo.currentLoad
      };
    });
    
    // Sort by score and return the best node
    scoredNodes.sort((a, b) => b.score - a.score);
    return scoredNodes[0].node;
  }
  
  calculateDiversityScore(node, requestType) {
    // In a real implementation, this would consider the distribution of request types
    // across nodes to avoid overloading any single node with a specific request type
    // For now, we'll return a neutral score
    return 0.5;
  }
  
  updateNodeLoad(node, requestType, completed = true) {
    const nodeInfo = this.nodeAvailability.get(node);
    const loadChange = completed ? -this.getRequestLoad(requestType) : this.getRequestLoad(requestType);
    
    nodeInfo.currentLoad = Math.max(0, Math.min(1, nodeInfo.currentLoad + loadChange));
    
    // Recalculate health score
    this.calculateHealthScores();
  }
}

// Create and use the load balancer
const loadBalancer = new PredictiveLoadBalancer(
  nodeList.nodes,
  performanceHistory,
  currentLoad,
  requestTypes
);

// Example usage
function processRequest(requestType) {
  // Select the best node for this request
  const selectedNode = loadBalancer.selectNode(requestType);
  
  console.log(`Selected node for ${requestType} request: ${selectedNode}`);
  
  // Simulate processing
  setTimeout(() => {
    // Update node load (request completed)
    loadBalancer.updateNodeLoad(selectedNode, requestType, true);
    console.log(`Request completed on ${selectedNode}`);
  }, 1000);
  
  return selectedNode;
}

// Simulate processing multiple requests
const requestTypesList = Object.keys(requestTypes);
for (let i = 0; i < 20; i++) {
  const randomRequestType = requestTypesList[Math.floor(Math.random() * requestTypesList.length)];
  processRequest(randomRequestType);
}

// Export for use in other modules
export { PredictiveLoadBalancer, processRequest };
