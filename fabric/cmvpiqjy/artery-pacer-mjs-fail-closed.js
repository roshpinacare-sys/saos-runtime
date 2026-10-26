// Distributed rate limiter with fail-closed capabilities
// Replaces artery-pacer.mjs in saos-runtime

import { createHash } from 'crypto';
import { setInterval, clearTimeout } from 'timers';

export class DistributedArteryPacer {
  constructor(options = {}) {
    this.windowMs = options.windowMs || 60000; // 1 minute default
    this.maxRequests = options.maxRequests || 100;
    this.failClosedTimeout = options.failClosedTimeout || 300000; // 5 minutes
    this.healthCheckInterval = options.healthCheckInterval || 30000; // 30 seconds
    this.nodeId = options.nodeId || this.generateNodeId();
    this.clusterNodes = options.clusterNodes || [this.nodeId];
    
    this.requests = new Map();
    this.failClosed = false;
    this.failClosedUntil = null;
    this.healthStatus = new Map();
    
    this.startHealthChecks();
    this.cleanupInterval = setInterval(() => this.cleanup(), this.windowMs);
  }
  
  generateNodeId() {
    return createHash('sha256').update(process.pid.toString() + Date.now()).digest('hex').substring(0, 8);
  }
  
  async checkHealth() {
    // Simulated health check - in real implementation would check actual dependencies
    return {
      healthy: true,
      timestamp: Date.now(),
      nodeId: this.nodeId
    };
  }
  
  startHealthChecks() {
    this.healthCheckIntervalId = setInterval(async () => {
      const health = await this.checkHealth();
      this.healthStatus.set(this.nodeId, health);
      
      // Check cluster health
      let healthyNodes = 0;
      for (const [nodeId, status] of this.healthStatus) {
        if (status.healthy) healthyNodes++;
      }
      
      // Fail closed if less than 30% of nodes are healthy
      if (healthyNodes < Math.ceil(this.clusterNodes.length * 0.3)) {
        this.enterFailClosed('Insufficient healthy nodes');
      }
    }, this.healthCheckInterval);
  }
  
  enterFailClosed(reason) {
    if (!this.failClosed) {
      this.failClosed = true;
      this.failClosedUntil = Date.now() + this.failClosedTimeout;
      console.warn(`[DistributedArteryPacer] Entering fail-closed mode: ${reason}`);
      
      // Log the event for monitoring
      this.logEvent({
        type: 'fail-closed-enter',
        reason,
        timestamp: Date.now(),
        nodeId: this.nodeId
      });
    }
  }
  
  exitFailClosed() {
    if (this.failClosed && Date.now() > this.failClosedUntil) {
      this.failClosed = false;
      this.failClosedUntil = null;
      console.log(`[DistributedArteryPacer] Exiting fail-closed mode`);
      
      // Log the event for monitoring
      this.logEvent({
        type: 'fail-closed-exit',
        timestamp: Date.now(),
        nodeId: this.nodeId
      });
    }
  }
  
  async logEvent(event) {
    // In a real implementation, this would send to a distributed logging system
    console.log(`[DistributedArteryPacer] Event:`, JSON.stringify(event));
  }
  
  async tryAcquire(resourceId) {
    // Check if we should exit fail-closed mode
    this.exitFailClosed();
    
    // If still in fail-closed mode, deny the request
    if (this.failClosed) {
      this.logEvent({
        type: 'request-denied',
        reason: 'fail-closed',
        resourceId,
        timestamp: Date.now(),
        nodeId: this.nodeId
      });
      return false;
    }
    
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    // Clean up old requests
    if (this.requests.has(resourceId)) {
      const resourceRequests = this.requests.get(resourceId);
      resourceRequests.filter(req => req.timestamp > windowStart);
    } else {
      this.requests.set(resourceId, []);
    }
    
    const resourceRequests = this.requests.get(resourceId);
    
    // Check if we're at the limit
    if (resourceRequests.length >= this.maxRequests) {
      this.logEvent({
        type: 'rate-limit-exceeded',
        resourceId,
        timestamp: Date.now(),
        nodeId: this.nodeId
      });
      return false;
    }
    
    // Record the request
    resourceRequests.push({
      timestamp: now,
      nodeId: this.nodeId
    });
    
    return true;
  }
  
  // For backward compatibility with artery-pacer.mjs API
  async acquire(resourceId) {
    return this.tryAcquire(resourceId);
  }
  
  // Get current status for monitoring
  getStatus() {
    return {
      nodeId: this.nodeId,
      failClosed: this.failClosed,
      failClosedUntil: this.failClosedUntil,
      requestCount: Array.from(this.requests.values()).reduce((sum, reqs) => sum + reqs.length, 0),
      clusterHealth: Array.from(this.healthStatus.values()).filter(h => h.healthy).length,
      timestamp: Date.now()
    };
  }
  
  cleanup() {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    for (const [resourceId, requests] of this.requests) {
      const filtered = requests.filter(req => req.timestamp > windowStart);
      if (filtered.length !== requests.length) {
        this.requests.set(resourceId, filtered);
      }
    }
  }
  
  // Graceful shutdown
  shutdown() {
    clearInterval(this.cleanupInterval);
    clearInterval(this.healthCheckIntervalId);
  }
}

// Export singleton instance for compatibility
const pacer = new DistributedArteryPacer({
  windowMs: 60000,
  maxRequests: 100,
  failClosedTimeout: 300000,
  healthCheckInterval: 30000,
  nodeId: process.env.NODE_ID || 'default',
  clusterNodes: (process.env.CLUSTER_NODES || '').split(',').filter(Boolean)
});

export default pacer;
