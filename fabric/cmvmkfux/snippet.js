// saos-runtime/balanced-load-distributor.mjs

import { createHash } from 'crypto';
import { blurtNodes } from '../blurt-nodes.json' assert { type: 'json' };

/**
 * Balanced Load Distributor for saos-runtime
 * Implements dynamic load balancing across available nodes
 * considering current load, processing rate, and memory availability
 */
class BalancedLoadDistributor {
  constructor() {
    this.nodes = blurtNodes.nodes;
    this.nodeStats = new Map();
    this.loadHistory = new Map();
    this.rebalanceThreshold = 0.75; // 75% load triggers rebalance
    this.minRebalanceInterval = 60000; // 1 minute
    this.lastRebalance = 0;
    
    // Initialize stats for each node
    this.nodes.forEach(node => {
      this.nodeStats.set(node, {
        currentLoad: 0,
        processingRate: 0,
        memoryAvailable: 100, // percentage
        lastUpdated: Date.now(),
        failures: 0,
        successes: 0
      });
      this.loadHistory.set(node, []);
    });
  }

  /**
   * Select the best node for the current request
   * @returns {string} Selected node URL
   */
  selectNode() {
    const now = Date.now();
    
    // Check if rebalance is needed
    if (now - this.lastRebalance > this.minRebalanceInterval) {
      this.rebalanceIfNeeded();
    }

    // Calculate scores for each node
    const scoredNodes = Array.from(this.nodeStats.entries()).map(([node, stats]) => {
      const score = this.calculateNodeScore(node, stats);
      return { node, score };
    });

    // Sort by score (lower is better)
    scoredNodes.sort((a, b) => a.score - b.score);

    // Select the best node
    const selectedNode = scoredNodes[0].node;
    
    // Update stats for the selected node
    this.updateNodeStats(selectedNode, 1);
    
    return selectedNode;
  }

  /**
   * Calculate a score for a node based on various factors
   * @param {string} node - Node URL
   * @param {object} stats - Node statistics
   * @returns {number} Calculated score
   */
  calculateNodeScore(node, stats) {
    // Base score components
    const loadWeight = 0.4; // 40% weight to current load
    const rateWeight = 0.3; // 30% weight to processing rate
    const memoryWeight = 0.2; // 20% weight to memory availability
    const failureWeight = 0.1; // 10% weight to failure rate

    // Normalize values (0-1 scale)
    const normalizedLoad = Math.min(stats.currentLoad / 100, 1);
    const normalizedRate = Math.min(stats.processingRate / 10, 1); // Assuming max 10 req/s
    const normalizedMemory = stats.memoryAvailable / 100;
    const normalizedFailures = Math.min(stats.failures / 10, 1); // Normalize to 0-1

    // Calculate weighted score (lower is better)
    const score = 
      normalizedLoad * loadWeight +
      normalizedRate * rateWeight +
      (1 - normalizedMemory) * memoryWeight + // Invert memory (less available = higher score)
      normalizedFailures * failureWeight;

    return score;
  }

  /**
   * Check if rebalancing is needed and perform it
   */
  rebalanceIfNeeded() {
    const now = Date.now();
    const totalLoad = Array.from(this.nodeStats.values())
      .reduce((sum, stats) => sum + stats.currentLoad, 0);
    
    const avgLoad = totalLoad / this.nodes.length;
    
    if (avgLoad > this.rebalanceThreshold * 100) {
      this.performRebalance();
      this.lastRebalance = now;
    }
  }

  /**
   * Perform load rebalancing
   */
  performRebalance() {
    console.log(`[LoadDistributor] Rebalancing load at ${new Date().toISOString()}`);
    
    // Get current load distribution
    const loadDistribution = Array.from(this.nodeStats.entries()).map(([node, stats]) => ({
      node,
      load: stats.currentLoad
    }));
    
    // Sort by load (highest first)
    loadDistribution.sort((a, b) => b.load - a.load);
    
    // Identify overloaded nodes
    const overloadedNodes = loadDistribution.filter(item => 
      item.load > this.rebalanceThreshold * 100);
    
    // Identify underloaded nodes
    const underloadedNodes = loadDistribution.filter(item => 
      item.load < this.rebalanceThreshold * 0.5); // 50% of threshold
    
    if (overloadedNodes.length > 0 && underloadedNodes.length > 0) {
      // Redistribute load from overloaded to underloaded nodes
      const totalOverload = overloadedNodes.reduce((sum, item) => 
        sum + (item.load - this.rebalanceThreshold * 100), 0);
      
      const redistributionPerNode = totalOverload / underloadedNodes.length;
      
      // Perform redistribution
      overloadedNodes.forEach(overloaded => {
        const transferAmount = Math.min(
          overloaded.load * 0.2, // Transfer 20% of load
          redistributionPerNode
        );
        
        this.updateNodeStats(overloaded.node, -transferAmount);
        
        // Find the best underloaded node to transfer to
        const bestUnderloaded = underloadedNodes.reduce((best, current) => {
          return this.calculateNodeScore(current.node, this.nodeStats.get(current.node)) < 
                 this.calculateNodeScore(best.node, this.nodeStats.get(best.node)) 
                 ? current : best;
        });
        
        this.updateNodeStats(bestUnderloaded.node, transferAmount);
        console.log(`[LoadDistributor] Transferred ${transferAmount.toFixed(2)} load from ${overloaded.node} to ${bestUnderloaded.node}`);
      });
    }
  }

  /**
   * Update node statistics
   * @param {string} node - Node URL
   * @param {number} loadChange - Change in load (positive or negative)
   */
  updateNodeStats(node, loadChange) {
    const stats = this.nodeStats.get(node);
    if (!stats) return;
    
    // Update load with bounds checking
    stats.currentLoad = Math.max(0, Math.min(100, stats.currentLoad + loadChange));
    
    // Update processing rate (simplified - in real implementation, this would be measured)
    if (loadChange > 0) {
      stats.processingRate = Math.min(10, stats.processingRate + 0.1);
    } else {
      stats.processingRate = Math.max(0, stats.processingRate - 0.1);
    }
    
    // Update memory availability (simplified)
    stats.memoryAvailable = Math.max(0, Math.min(100, 100 - stats.currentLoad * 0.8));
    
    // Update timestamp
    stats.lastUpdated = Date.now();
    
    // Update history
    const history = this.loadHistory.get(node);
    history.push({
      timestamp: Date.now(),
      load: stats.currentLoad
    });
    
    // Keep only last 100 entries
    if (history.length > 100) {
      history.shift();
    }
  }

  /**
   * Record a successful request
   * @param {string} node - Node URL
   */
  recordSuccess(node) {
    const stats = this.nodeStats.get(node);
    if (stats) {
      stats.successes++;
      this.updateNodeStats(node, -0.5); // Reduce load on success
    }
  }

  /**
   * Record a failed request
   * @param {string} node - Node URL
   */
  recordFailure(node) {
    const stats = this.nodeStats.get(node);
    if (stats) {
      stats.failures++;
      this.updateNodeStats(node, 0.5); // Increase load on failure
    }
  }

  /**
   * Get current statistics
   * @returns {object} Statistics summary
   */
  getStats() {
    const stats = {};
    
    this.nodes.forEach(node => {
      const nodeStat = this.nodeStats.get(node);
      stats[node] = {
        currentLoad: nodeStat.currentLoad,
        processingRate: nodeStat.processingRate,
        memoryAvailable: nodeStat.memoryAvailable,
        successes: nodeStat.successes,
        failures: nodeStat.failures
      };
    });
    
    return stats;
  }
}

// Export for use in saos-runtime
export default BalancedLoadDistributor;

// Example usage:
// const distributor = new BalancedLoadDistributor();
// const selectedNode = distributor.selectNode();
// console.log(`Selected node: ${selectedNode}`);
// distributor.recordSuccess(selectedNode);
// console.log('Current stats:', distributor.getStats());