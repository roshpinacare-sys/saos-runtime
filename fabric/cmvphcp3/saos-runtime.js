import { createHash } from 'crypto';
import { EventEmitter } from 'events';

/**
 * ArteryPacer - Central rate limiting module with EWMA and fail-closed support
 * Designed for SAOS runtime autonomous network
 */
export class ArteryPacer extends EventEmitter {
  /**
   * @param {Object} config - Configuration object
   * @param {number} config.requestThreshold - Max requests per window before triggering rate limit
   * @param {number} config.windowSizeMs - Time window in ms for rate calculation
   * @param {number} config.decayFactor - EWMA decay factor (0-1, closer to 1 = slower decay)
   * @param {number} config.failureThreshold - Number of consecutive failures before fail-closed
   * @param {number} config.recoveryTimeMs - Time to attempt recovery after fail-closed
   * @param {number} config.minWindowMs - Minimum time between requests when rate limited
   */
  constructor(config = {}) {
    super();
    
    // Default configuration with values optimized for SAOS network
    this.config = {
      requestThreshold: 100,
      windowSizeMs: 60000, // 1 minute
      decayFactor: 0.8,
      failureThreshold: 5,
      recoveryTimeMs: 300000, // 5 minutes
      minWindowMs: 100,
      ...config
    };
    
    // Internal state
    this.state = {
      requestCount: 0,
      ewmaRate: 0,
      lastRequestTime: 0,
      consecutiveFailures: 0,
      isFailClosed: false,
      failClosedSince: null,
      windowStartTime: Date.now(),
      requests: [] // Track request timestamps for precise window calculation
    };
    
    // Start background maintenance
    this.maintenanceInterval = setInterval(() => this.maintenance(), 10000);
  }
  
  /**
   * Check if request is allowed
   * @returns {Object} { allowed: boolean, waitTime: number, reason: string }
   */
  checkRequest() {
    const now = Date.now();
    
    // Check if in fail-closed state
    if (this.state.isFailClosed) {
      const timeSinceFail = now - this.state.failClosedSince;
      const remainingWait = Math.max(0, this.config.recoveryTimeMs - timeSinceFail);
      
      if (remainingWait > 0) {
        return {
          allowed: false,
          waitTime: remainingWait,
          reason: `fail-closed recovery in progress (${Math.ceil(remainingWait/1000)}s remaining)`
        };
      } else {
        // Attempt recovery
        this.state.isFailClosed = false;
        this.state.consecutiveFailures = 0;
        this.emit('recovery');
      }
    }
    
    // Check minimum time between requests
    const timeSinceLastRequest = now - this.state.lastRequestTime;
    if (timeSinceLastRequest < this.config.minWindowMs) {
      return {
        allowed: false,
        waitTime: this.config.minWindowMs - timeSinceLastRequest,
        reason: 'minimum window between requests'
      };
    }
    
    // Update window and calculate rate
    this.updateWindow(now);
    
    // Check if we've exceeded the threshold
    if (this.state.ewmaRate >= this.config.requestThreshold) {
      return {
        allowed: false,
        waitTime: this.calculateWaitTime(),
        reason: `rate limit exceeded (EWMA: ${this.state.ewmaRate.toFixed(2)})`
      };
    }
    
    // Request is allowed
    return {
      allowed: true,
      waitTime: 0,
      reason: 'request allowed'
    };
  }
  
  /**
   * Record a request (allowed or denied)
   * @param {boolean} success - Whether the request was successful
   */
  recordRequest(success = true) {
    const now = Date.now();
    
    // Update request tracking
    this.state.requests.push({
      timestamp: now,
      success
    });
    
    // Update last request time
    this.state.lastRequestTime = now;
    
    // Update failure tracking
    if (!success) {
      this.state.consecutiveFailures++;
      
      // Check for fail-closed trigger
      if (this.state.consecutiveFailures >= this.config.failureThreshold) {
        this.state.isFailClosed = true;
        this.state.failClosedSince = now;
        this.emit('fail-closed', { consecutiveFailures: this.state.consecutiveFailures });
      }
    } else {
      this.state.consecutiveFailures = 0;
    }
    
    // Update window
    this.updateWindow(now);
  }
  
  /**
   * Update the time window and calculate EWMA
   * @param {number} now - Current timestamp
   */
  updateWindow(now) {
    // Remove old requests outside the current window
    const cutoff = now - this.config.windowSizeMs;
    this.state.requests = this.state.requests.filter(req => req.timestamp > cutoff);
    
    // Calculate simple rate for the current window
    const simpleRate = this.state.requests.length;
    
    // Update EWMA
    this.state.ewmaRate = this.calculateEWMA(simpleRate);
    
    // Emit rate update event
    this.emit('rate-update', {
      ewmaRate: this.state.ewmaRate,
      simpleRate,
      windowSizeMs: this.config.windowSizeMs
    });
  }
  
  /**
   * Calculate Exponentially Weighted Moving Average
   * @param {number} currentRate - Current rate measurement
   * @returns {number} - EWMA value
   */
  calculateEWMA(currentRate) {
    // EWMA formula: new_value = (decay_factor * old_value) + ((1 - decay_factor) * current_value)
    return (this.config.decayFactor * this.state.ewmaRate) + 
           ((1 - this.config.decayFactor) * currentRate);
  }
  
  /**
   * Calculate recommended wait time when rate limited
   * @returns {number} - Wait time in ms
   */
  calculateWaitTime() {
    // Simple proportional wait time based on how far we are over threshold
    const overage = this.state.ewmaRate - this.config.requestThreshold;
    const proportionalWait = overage * (this.config.windowSizeMs / this.config.requestThreshold);
    
    // Ensure minimum wait time
    return Math.max(this.config.minWindowMs, proportionalWait);
  }
  
  /**
   * Get current status
   * @returns {Object} - Current pacer status
   */
  getStatus() {
    return {
      config: this.config,
      state: {
        ewmaRate: this.state.ewmaRate,
        simpleRate: this.state.requests.length,
        consecutiveFailures: this.state.consecutiveFailures,
        isFailClosed: this.state.isFailClosed,
        failClosedSince: this.state.failClosedSince,
        lastRequestTime: this.state.lastRequestTime
      },
      timestamp: Date.now()
    };
  }
  
  /**
   * Maintenance tasks
   */
  maintenance() {
    const now = Date.now();
    
    // Clean up old requests
    this.updateWindow(now);
    
    // Check if we should attempt recovery from fail-closed
    if (this.state.isFailClosed && 
        now - this.state.failClosedSince > this.config.recoveryTimeMs) {
      this.state.isFailClosed = false;
      this.state.consecutiveFailures = 0;
      this.emit('recovery');
    }
  }
  
  /**
   * Graceful shutdown
   */
  shutdown() {
    clearInterval(this.maintenanceInterval);
    this.emit('shutdown');
  }
}

/**
 * Decorator function to apply rate limiting to any async function
 * @param {Function} fn - Function to wrap
 * @param {ArteryPacer} pacer - Pacer instance to use
 * @returns {Function} - Wrapped function
 */
export function withRateLimit(fn, pacer) {
  return async (...args) => {
    const check = pacer.checkRequest();
    
    if (!check.allowed) {
      const error = new Error(`Rate limited: ${check.reason}`);
      error.waitTime = check.waitTime;
      error.reason = check.reason;
      throw error;
    }
    
    try {
      const result = await fn(...args);
      pacer.recordRequest(true);
      return result;
    } catch (err) {
      pacer.recordRequest(false);
      throw err;
    }
  };
}

/**
 * Example usage and tests
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  // Example 1: Basic usage
  const pacer = new ArteryPacer({
    requestThreshold: 10,
    windowSizeMs: 5000,
    decayFactor: 0.7,
    failureThreshold: 3,
    recoveryTimeMs: 10000
  });
  
  // Simulate requests
  const simulateRequests = async (count) => {
    for (let i = 0; i < count; i++) {
      const check = pacer.checkRequest();
      
      if (check.allowed) {
        console.log(`Request ${i + 1}: Allowed`);
        // Simulate request with 20% failure rate
        const success = Math.random() > 0.2;
        pacer.recordRequest(success);
      } else {
        console.log(`Request ${i + 1}: Denied - ${check.reason} (wait ${Math.ceil(check.waitTime/1000)}s)`);
      }
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  };
  
  // Run simulation
  console.log('=== Basic Rate Limiting Test ===');
  simulateRequests(20);
  
  // Example 2: Using withRateLimit decorator
  const mockApiCall = async (endpoint) => {
    console.log(`Calling API: ${endpoint}`);
    // Simulate API call with 10% failure rate
    if (Math.random() < 0.1) {
      throw new Error('API call failed');
    }
    return { success: true, data: `Response from ${endpoint}` };
  };
  
  const rateLimitedApiCall = withRateLimit(mockApiCall, pacer);
  
  console.log('\n=== Decorator Rate Limiting Test ===');
  (async () => {
    try {
      const result = await rateLimitedApiCall('/users');
      console.log('Success:', result);
    } catch (err) {
      console.log('Failed:', err.message);
    }
    
    try {
      const result = await rateLimitedApiCall('/posts');
      console.log('Success:', result);
    } catch (err) {
      console.log('Failed:', err.message);
    }
  })();
  
  // Example 3: Event monitoring
  pacer.on('rate-update', (data) => {
    console.log(`\nRate Update: EWMA=${data.ewmaRate.toFixed(2)}, Simple=${data.simpleRate}`);
  });
  
  pacer.on('fail-closed', (data) => {
    console.log(`\nFAIL-CLOSED triggered after ${data.consecutiveFailures} failures`);
  });
  
  pacer.on('recovery', () => {
    console.log('\nSystem recovered from fail-closed state');
  });
  
  // Print final status
  setTimeout(() => {
    console.log('\n=== Final Status ===');
    console.log(JSON.stringify(pacer.getStatus(), null, 2));
    pacer.shutdown();
  }, 5000);
}