import { createHash } from 'crypto';

/**
 * Distributed rate limiter and error handler for saos-runtime agents
 * Implements circuit breaker, rate limiting, and exponential backoff
 */
class DistributedAgentController {
  constructor(agentId, config = {}) {
    this.agentId = agentId;
    this.config = {
      maxRequestsPerInterval: config.maxRequestsPerInterval || 100,
      intervalMs: config.intervalMs || 60000,
      errorThreshold: config.errorThreshold || 5,
      backoffFactor: config.backoffFactor || 2,
      maxBackoffMs: config.maxBackoffMs || 300000,
      healthCheckInterval: config.healthCheckInterval || 5000,
      ...config
    };
    
    this.state = {
      requestCount: 0,
      errorCount: 0,
      lastErrorReset: Date.now(),
      backoffTime: 0,
      lastRequestTime: 0,
      circuitOpen: false,
      consecutiveErrors: 0
    };
    
    this.intervals = {
      healthCheck: null,
      resetCounters: null
    };
    
    this.startMonitoring();
  }
  
  /**
   * Start monitoring intervals for health checks and counter resets
   */
  startMonitoring() {
    this.intervals.healthCheck = setInterval(
      () => this.checkHealth(),
      this.config.healthCheckInterval
    );
    
    this.intervals.resetCounters = setInterval(
      () => this.resetCounters(),
      this.config.intervalMs
    );
  }
  
  /**
   * Stop all monitoring intervals
   */
  stopMonitoring() {
    if (this.intervals.healthCheck) {
      clearInterval(this.intervals.healthCheck);
    }
    
    if (this.intervals.resetCounters) {
      clearInterval(this.intervals.resetCounters);
    }
  }
  
  /**
   * Check if agent should proceed with request
   */
  canProceed() {
    const now = Date.now();
    
    // Check if in backoff period
    if (this.state.backoffTime > now) {
      return false;
    }
    
    // Check if circuit is open
    if (this.state.circuitOpen) {
      return false;
    }
    
    // Check rate limit
    if (this.state.requestCount >= this.config.maxRequestsPerInterval) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Execute a request with rate limiting and error handling
   */
  async execute(requestFn, options = {}) {
    if (!this.canProceed()) {
      throw new Error(`Agent ${this.agentId} blocked: rate limit or circuit open`);
    }
    
    const start = Date.now();
    
    try {
      const result = await requestFn();
      this.recordSuccess(start);
      return result;
    } catch (error) {
      this.recordError(error, start);
      throw error;
    }
  }
  
  /**
   * Record successful request
   */
  recordSuccess(startTime) {
    this.state.requestCount++;
    this.state.lastRequestTime = Date.now();
    this.state.consecutiveErrors = 0;
    
    // Reset circuit breaker if enough successes
    if (this.state.circuitOpen && this.state.consecutiveErrors === 0) {
      this.state.circuitOpen = false;
    }
  }
  
  /**
   * Record failed request and update state
   */
  recordError(error, startTime) {
    this.state.requestCount++;
    this.state.errorCount++;
    this.state.lastRequestTime = Date.now();
    this.state.consecutiveErrors++;
    
    // Check if we should open the circuit
    if (this.state.consecutiveErrors >= this.config.errorThreshold) {
      this.state.circuitOpen = true;
      this.scheduleBackoff();
    }
  }
  
  /**
   * Schedule exponential backoff
   */
  scheduleBackoff() {
    const now = Date.now();
    const backoffDuration = Math.min(
      this.config.maxBackoffMs,
      Math.pow(this.config.backoffFactor, this.state.consecutiveErrors) * 1000
    );
    
    this.state.backoffTime = now + backoffDuration;
  }
  
  /**
   * Reset counters at interval end
   */
  resetCounters() {
    this.state.requestCount = 0;
    this.state.errorCount = 0;
    this.state.lastErrorReset = Date.now();
  }
  
  /**
   * Perform health check
   */
  checkHealth() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.state.lastRequestTime;
    
    // If no requests for extended period, reset state
    if (timeSinceLastRequest > this.config.intervalMs * 2) {
      this.state.circuitOpen = false;
      this.state.backoffTime = 0;
      this.state.consecutiveErrors = 0;
    }
    
    return {
      agentId: this.agentId,
      healthy: !this.state.circuitOpen,
      requestCount: this.state.requestCount,
      errorCount: this.state.errorCount,
      consecutiveErrors: this.state.consecutiveErrors,
      backoffTime: this.state.backoffTime,
      lastRequestTime: this.state.lastRequestTime
    };
  }
  
  /**
   * Get current state
   */
  getState() {
    return {
      ...this.state,
      agentId: this.agentId,
      config: this.config
    };
  }
}

/**
 * Factory function to create agent controllers
 */
function createAgentController(agentId, config) {
  return new DistributedAgentController(agentId, config);
}

export { DistributedAgentController, createAgentController };
