import EventEmitter from 'events';
import { createHash } from 'crypto';

class CentralRateLimiter extends EventEmitter {
  constructor(config = {}) {
    super();
    this.globalRateLimit = config.globalRateLimit || 100; // requests per minute
    this.agentStates = new Map();
    this.failClosed = config.failClosed !== false;
    this.warningThreshold = config.warningThreshold || 0.8;
    this.thunderingHerdDelay = config.thunderingHerdDelay || 5000; // ms
    this.lastResetTime = Date.now();
    this.currentWindowCount = 0;
    
    // Start the reset interval
    this.resetInterval = setInterval(() => this.resetWindow(), 60000);
    
    // Register for system events
    this.on('agentRequest', this.handleAgentRequest.bind(this));
    this.on('systemAlert', this.handleSystemAlert.bind(this));
  }
  
  resetWindow() {
    this.currentWindowCount = 0;
    this.lastResetTime = Date.now();
    this.emit('windowReset');
  }
  
  handleAgentRequest(agentId, priority = 'normal') {
    const now = Date.now();
    
    // Check global rate limit
    if (this.currentWindowCount >= this.globalRateLimit) {
      if (this.failClosed) {
        this.emit('requestRejected', {
          agentId,
          reason: 'global_rate_limit_exceeded',
          timestamp: now
        });
        return false;
      }
      // If not fail-closed, continue but emit warning
      this.emit('rateLimitWarning', {
        agentId,
        currentCount: this.currentWindowCount,
        limit: this.globalRateLimit,
        timestamp: now
      });
    }
    
    // Initialize agent state if not exists
    if (!this.agentStates.has(agentId)) {
      this.agentStates.set(agentId, {
        requestCount: 0,
        lastRequestTime: 0,
        isActive: true,
        failureCount: 0,
        lastFailureTime: 0,
        delayUntil: 0
      });
    }
    
    const agentState = this.agentStates.get(agentId);
    
    // Check if agent is in delay mode (thundering herd prevention)
    if (now < agentState.delayUntil) {
      this.emit('requestDelayed', {
        agentId,
        reason: 'thundering_herd_prevention',
        delayMs: agentState.delayUntil - now,
        timestamp: now
      });
      return false;
    }
    
    // Check if agent has failed recently
    if (agentState.failureCount > 0 && 
        (now - agentState.lastFailureTime) < 300000) { // 5 minutes
      this.emit('requestRejected', {
        agentId,
        reason: 'agent_recent_failure',
        failureCount: agentState.failureCount,
        timestamp: now
      });
      return false;
    }
    
    // Check for potential overload
    const usageRatio = this.currentWindowCount / this.globalRateLimit;
    if (usageRatio > this.warningThreshold) {
      this.emit('potentialOverload', {
        currentUsage: this.currentWindowCount,
        limit: this.globalRateLimit,
        ratio: usageRatio,
        timestamp: now
      });
    }
    
    // Record the request
    agentState.requestCount++;
    agentState.lastRequestTime = now;
    this.currentWindowCount++;
    
    // Emit success event
    this.emit('requestAccepted', {
      agentId,
      priority,
      totalRequests: this.currentWindowCount,
      timestamp: now
    });
    
    return true;
  }
  
  handleSystemAlert(alert) {
    if (alert.type === 'system_overload') {
      // Activate fail-closed mode if not already
      this.failClosed = true;
      this.emit('failClosedActivated', {
        reason: 'system_overload_detected',
        timestamp: Date.now()
      });
    } else if (alert.type === 'system_recovery') {
      // Deactivate fail-closed mode
      this.failClosed = false;
      this.emit('failClosedDeactivated', {
        reason: 'system_recovery_confirmed',
        timestamp: Date.now()
      });
    }
  }
  
  recordAgentFailure(agentId) {
    const agentState = this.agentStates.get(agentId);
    if (agentState) {
      agentState.failureCount++;
      agentState.lastFailureTime = Date.now();
      
      // Implement exponential backoff for failing agents
      const delay = Math.min(300000, 1000 * Math.pow(2, agentState.failureCount));
      agentState.delayUntil = Date.now() + delay;
      
      this.emit('agentFailureRecorded', {
        agentId,
        failureCount: agentState.failureCount,
        nextAttemptDelay: delay,
        timestamp: Date.now()
      });
    }
  }
  
  getSystemStatus() {
    const now = Date.now();
    const usageRatio = this.currentWindowCount / this.globalRateLimit;
    
    return {
      globalRateLimit: this.globalRateLimit,
      currentUsage: this.currentWindowCount,
      usageRatio,
      failClosedMode: this.failClosed,
      agentCount: this.agentStates.size,
      activeAgents: Array.from(this.agentStates.values()).filter(state => state.isActive).length,
      windowTimeRemaining: 60000 - (now - this.lastResetTime),
      timestamp: now
    };
  }
  
  getAgentStatus(agentId) {
    const agentState = this.agentStates.get(agentId);
    if (!agentState) return null;
    
    return {
      agentId,
      requestCount: agentState.requestCount,
      lastRequestTime: agentState.lastRequestTime,
      isActive: agentState.isActive,
      failureCount: agentState.failureCount,
      nextAttemptDelay: Math.max(0, agentState.delayUntil - Date.now()),
      timestamp: Date.now()
    };
  }
  
  // Strategy pattern for different rate limiting approaches
  applyStrategy(strategy, agentId, ...args) {
    if (this[strategy]) {
      return this[strategy](agentId, ...args);
    }
    throw new Error(`Unknown strategy: ${strategy}`);
  }
  
  // Example strategy: Token Bucket
  tokenBucket(agentId, tokens = 1, bucketSize = 10, refillRate = 1) {
    const agentState = this.agentStates.get(agentId) || {
      tokens: bucketSize,
      lastRefill: Date.now()
    };
    
    const now = Date.now();
    const elapsed = now - agentState.lastRefill;
    const tokensToAdd = Math.floor(elapsed / (1000 / refillRate));
    
    agentState.tokens = Math.min(bucketSize, agentState.tokens + tokensToAdd);
    agentState.lastRefill = now;
    
    if (agentState.tokens >= tokens) {
      agentState.tokens -= tokens;
      return true;
    }
    
    return false;
  }
  
  // Example strategy: Fixed Window
  fixedWindow(agentId, windowMs = 60000, maxRequests = 10) {
    const now = Date.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;
    
    const agentState = this.agentStates.get(agentId) || {
      windowStart,
      count: 0
    };
    
    if (agentState.windowStart !== windowStart) {
      // New window
      agentState.windowStart = windowStart;
      agentState.count = 0;
    }
    
    if (agentState.count < maxRequests) {
      agentState.count++;
      return true;
    }
    
    return false;
  }
  
  shutdown() {
    clearInterval(this.resetInterval);
    this.removeAllListeners();
  }
}

// Export for use in the system
export default CentralRateLimiter;

// Example usage:
// const limiter = new CentralRateLimiter({
//   globalRateLimit: 500,
//   failClosed: true,
//   warningThreshold: 0.7
// });
// 
// limiter.on('requestAccepted', (data) => {
//   console.log(`Request accepted from ${data.agentId}`);
// });
// 
// limiter.on('requestRejected', (data) => {
//   console.log(`Request rejected: ${data.reason}`);
// });
// 
// // Simulate agent requests
// for (let i = 0; i < 10; i++) {
//   const agentId = `agent-${i}`;
//   limiter.handleAgentRequest(agentId);
// }

// Create a unique ID for this instance
const instanceId = createHash('sha256')
  .update(Date.now().toString() + Math.random().toString())
  .digest('hex')
  .substring(0, 8);

console.log(`CentralRateLimiter instance initialized with ID: ${instanceId}`);
