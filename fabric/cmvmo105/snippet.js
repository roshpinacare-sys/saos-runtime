import { LRUCache } from 'lru-cache';

class NodePerformance {
  constructor(id) {
    this.id = id;
    this.processingTime = 0;
    this.memoryUsage = 0;
    this.lastUsed = 0;
    this.loadHistory = [];
  }

  updateLoad(load, processingTime, memoryUsage) {
    this.loadHistory.push({
      load,
      timestamp: Date.now(),
      processingTime,
      memoryUsage
    });
    
    // Keep only the last 100 load measurements
    if (this.loadHistory.length > 100) {
      this.loadHistory.shift();
    }
    
    this.lastUsed = Date.now();
  }

  getAverageProcessingTime() {
    if (this.loadHistory.length === 0) return 0;
    
    const totalTime = this.loadHistory.reduce(
      (sum, entry) => sum + entry.processingTime, 0
    );
    
    return totalTime / this.loadHistory.length;
  }

  getAverageMemoryUsage() {
    if (this.loadHistory.length === 0) return 0;
    
    const totalMemory = this.loadHistory.reduce(
      (sum, entry) => sum + entry.memoryUsage, 0
    );
    
    return totalMemory / this.loadHistory.length;
  }

  getLoadScore() {
    const avgProcessingTime = this.getAverageProcessingTime();
    const avgMemoryUsage = this.getAverageMemoryUsage();
    
    // Higher score means better performance (lower load)
    return 1 / (1 + avgProcessingTime + avgMemoryUsage);
  }
}

class LoadBalancer {
  constructor() {
    this.nodes = new Map();
    this.lruCache = new LRUCache({
      max: 100,
      ttl: 1000 * 60 * 5, // 5 minutes
    });
  }

  addNode(nodeId) {
    if (!this.nodes.has(nodeId)) {
      this.nodes.set(nodeId, new NodePerformance(nodeId));
    }
  }

  removeNode(nodeId) {
    this.nodes.delete(nodeId);
    this.lruCache.delete(nodeId);
  }

  updateNodePerformance(nodeId, load, processingTime, memoryUsage) {
    if (this.nodes.has(nodeId)) {
      const node = this.nodes.get(nodeId);
      node.updateLoad(load, processingTime, memoryUsage);
      this.lruCache.set(nodeId, node);
    }
  }

  allocateLoad(totalLoad, nodeIds) {
    // Ensure all nodes exist in our tracking
    nodeIds.forEach(id => this.addNode(id));
    
    // Filter out nodes that don't exist in our tracking
    const availableNodes = nodeIds.filter(id => this.nodes.has(id));
    
    if (availableNodes.length === 0) {
      throw new Error('No available nodes for load allocation');
    }
    
    // Calculate load scores for each node
    const nodeScores = availableNodes.map(id => {
      const node = this.nodes.get(id);
      return {
        id,
        score: node.getLoadScore(),
        lastUsed: node.lastUsed
      };
    });
    
    // Sort nodes by score (best first) and then by last used (LRU)
    nodeScores.sort((a, b) => {
      // First by score (descending)
      if (a.score !== b.score) {
        return b.score - a.score;
      }
      
      // Then by last used (ascending - LRU)
      return a.lastUsed - b.lastUsed;
    });
    
    // Allocate load based on scores
    const allocation = {};
    let remainingLoad = totalLoad;
    
    // Start with the best performing nodes
    for (const node of nodeScores) {
      if (remainingLoad <= 0) break;
      
      // Allocate proportionally to the node's score
      const proportionalLoad = Math.min(
        remainingLoad * (node.score / nodeScores.reduce((sum, n) => sum + n.score, 1)),
        totalLoad / nodeScores.length * 2 // Cap at 2x the average
      );
      
      allocation[node.id] = proportionalLoad;
      remainingLoad -= proportionalLoad;
    }
    
    // If there's remaining load, distribute equally among all nodes
    if (remainingLoad > 0) {
      const equalShare = remainingLoad / availableNodes.length;
      availableNodes.forEach(id => {
        if (!allocation[id]) {
          allocation[id] = equalShare;
        } else {
          allocation[id] += equalShare;
        }
      });
    }
    
    // Ensure no node gets negative load
    Object.keys(allocation).forEach(id => {
      if (allocation[id] < 0) {
        allocation[id] = 0;
      }
    });
    
    return allocation;
  }
}

// Unit tests
function testLoadBalancer() {
  console.log('Running LoadBalancer tests...');
  
  const lb = new LoadBalancer();
  
  // Test 1: Basic allocation
  lb.addNode('node1');
  lb.addNode('node2');
  lb.addNode('node3');
  
  const allocation1 = lb.allocateLoad(100, ['node1', 'node2', 'node3']);
  
  // Check total allocation
  const totalAllocation1 = Object.values(allocation1).reduce((sum, load) => sum + load, 0);
  console.assert(Math.abs(totalAllocation1 - 100) < 0.01, 'Test 1 failed: Total allocation should be 100');
  
  // Test 2: Update performance and re-allocate
  lb.updateNodePerformance('node1', 0.8, 100, 50);
  lb.updateNodePerformance('node2', 0.5, 80, 30);
  lb.updateNodePerformance('node3', 0.6, 90, 40);
  
  const allocation2 = lb.allocateLoad(100, ['node1', 'node2', 'node3']);
  
  // Check that node2 (best performance) gets more load
  console.assert(allocation2['node2'] > allocation2['node1'], 'Test 2 failed: Better node should get more load');
  console.assert(allocation2['node2'] > allocation2['node3'], 'Test 2 failed: Better node should get more load');
  
  // Test 3: LRU behavior
  // Allocate to node1 multiple times to make it recently used
  for (let i = 0; i < 5; i++) {
    lb.allocateLoad(10, ['node1']);
  }
  
  const allocation3 = lb.allocateLoad(100, ['node1', 'node2', 'node3']);
  
  // Check that node1 (recently used) gets less load
  console.assert(allocation3['node1'] < allocation3['node2'], 'Test 3 failed: Recently used node should get less load');
  console.assert(allocation3['node1'] < allocation3['node3'], 'Test 3 failed: Recently used node should get less load');
  
  // Test 4: Node failure handling
  lb.removeNode('node3');
  const allocation4 = lb.allocateLoad(100, ['node1', 'node2', 'node3']);
  
  // Check that node3 gets 0 load
  console.assert(allocation4['node3'] === 0, 'Test 4 failed: Removed node should get 0 load');
  
  // Check that remaining nodes still get the total load
  const totalAllocation4 = allocation4['node1'] + allocation4['node2'];
  console.assert(Math.abs(totalAllocation4 - 100) < 0.01, 'Test 4 failed: Total allocation should be 100');
  
  console.log('All tests passed!');
}

// Run tests
testLoadBalancer();

export { LoadBalancer, NodePerformance };