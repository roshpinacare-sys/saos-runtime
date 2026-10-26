import { createHash } from '@noble/hashes/sha256';
import { randomBytes } from '@noble/secp256k1';

/**
 * Exponential Rate Limiter with Independent Backoff
 * Implements exponential backoff with random jitter to prevent thundering herd.
 * Includes temporary load monitoring that triggers fail-closed mode when exceeding defined thresholds,
 * and progressive recovery with defined wait times.
 */
class ExponentialRateLimiter {
  constructor({ initialDelay = 1000, maxDelay = 30000, jitter = 0.2, maxAttempts = 10 }) {
    this.initialDelay = initialDelay;
    this.maxDelay = maxDelay;
    this.jitter = jitter;
    this.maxAttempts = maxAttempts;
    
    // Load monitoring
    this.currentLoad = 0;
    this.maxLoad = 100;
    this.failClosedThreshold = 80;
    this.failClosed = false;
    
    // Recovery state
    this.recoveryStartTime = null;
    this.recoveryDelay = initialDelay;
    
    // Component-specific load tracking
    this.componentLoads = new Map();
    
    // Performance tracking
    this.requestTimes = [];
    this.maxSamples = 100;
  }
  
  /**
   * Record a request and update load metrics
   * @param {string} component - Component identifier
   * @param {number} startTime - Request start timestamp
   * @param {boolean} success - Whether request succeeded
   */
  recordRequest(component, startTime, success = true) {
    const duration = Date.now() - startTime;
    this.requestTimes.push({ duration, success });
    
    if (this.requestTimes.length > this.maxSamples) {
      this.requestTimes.shift();
    }
    
    // Update component-specific load
    if (!this.componentLoads.has(component)) {
      this.componentLoads.set(component, {
        count: 0,
        failures: 0,
        avgDuration: 0,
        loadFactor: 0
      });
    }
    
    const componentLoad = this.componentLoads.get(component);
    componentLoad.count++;
    if (!success) componentLoad.failures++;
    
    // Update average duration with exponential moving average
    const alpha = 0.2;
    componentLoad.avgDuration = alpha * duration + (1 - alpha) * componentLoad.avgDuration;
    
    // Calculate load factor (0-1) based on failure rate and duration
    const failureRate = componentLoad.failures / componentLoad.count;
    componentLoad.loadFactor = Math.min(1, failureRate + (componentLoad.avgDuration / 1000));
    
    // Update overall load
    this.updateOverallLoad();
    
    // Check if we should go fail-closed
    if (this.currentLoad > this.failClosedThreshold && !this.failClosed) {
      this.enterFailClosedMode();
    }
  }
  
  /**
   * Update overall load based on component loads
   */
  updateOverallLoad() {
    if (this.componentLoads.size === 0) {
      this.currentLoad = 0;
      return;
    }
    
    // Calculate weighted average of component loads
    let totalWeight = 0;
    let weightedSum = 0;
    
    for (const [component, load] of this.componentLoads) {
      // Weight by recent activity (more recent = higher weight)
      const weight = Math.min(1, load.count / 10);
      weightedSum += load.loadFactor * weight;
      totalWeight += weight;
    }
    
    this.currentLoad = totalWeight > 0 ? Math.min(100, (weightedSum / totalWeight) * 100) : 0;
  }
  
  /**
   * Enter fail-closed mode
   */
  enterFailClosedMode() {
    this.failClosed = true;
    this.recoveryStartTime = Date.now();
    this.recoveryDelay = this.initialDelay;
    
    // Log the event (in a real system, this would go to a monitoring system)
    console.error(`[RateLimiter] Entering fail-closed mode due to high load: ${this.currentLoad}%`);
  }
  
  /**
   * Attempt to exit fail-closed mode
   */
  attemptRecovery() {
    if (!this.failClosed) return true;
    
    const timeSinceFailClosed = Date.now() - this.recoveryStartTime;
    
    // Check if enough time has passed for recovery attempt
    if (timeSinceFailClosed < this.recoveryDelay) {
      return false;
    }
    
    // Check if load has decreased significantly
    if (this.currentLoad < this.failClosedThreshold * 0.6) {
      this.failClosed = false;
      console.log(`[RateLimiter] Exiting fail-closed mode. Load: ${this.currentLoad}%`);
      return true;
    }
    
    // Otherwise, increase recovery delay and try again later
    this.recoveryDelay = Math.min(this.maxDelay, this.recoveryDelay * 2);
    this.recoveryStartTime = Date.now();
    return false;
  }
  
  /**
   * Get delay for next request with exponential backoff and jitter
   * @param {number} attempt - Current attempt number
   * @returns {number} Delay in milliseconds
   */
  getDelay(attempt) {
    if (attempt >= this.maxAttempts) {
      throw new Error(`Max attempts (${this.maxAttempts}) exceeded`);
    }
    
    // Calculate base delay with exponential backoff
    const baseDelay = Math.min(this.maxDelay, this.initialDelay * Math.pow(2, attempt));
    
    // Add jitter
    const jitterAmount = baseDelay * this.jitter;
    const jitterValue = Math.random() * 2 * jitterAmount - jitterAmount;
    
    return Math.max(0, baseDelay + jitterValue);
  }
  
  /**
   * Execute a function with rate limiting
   * @param {Function} fn - Function to execute
   * @param {string} component - Component identifier
   * @param {Object} options - Execution options
   * @returns {Promise} Result of the function
   */
  async execute(fn, component = 'default', options = {}) {
    const startTime = Date.now();
    
    // Check if we're in fail-closed mode
    if (this.failClosed && !options.force) {
      if (!this.attemptRecovery()) {
        throw new Error(`System in fail-closed mode. Try again in ${Math.ceil((this.recoveryDelay - (Date.now() - this.recoveryStartTime)) / 1000)}s`);
      }
    }
    
    let attempt = 0;
    let lastError;
    
    while (attempt < this.maxAttempts) {
      try {
        // Execute the function
        const result = await fn();
        
        // Record successful request
        this.recordRequest(component, startTime, true);
        
        // If we were in fail-closed mode, we're now recovering
        if (this.failClosed && this.currentLoad < this.failClosedThreshold * 0.8) {
          this.recoveryDelay = Math.max(this.initialDelay, this.recoveryDelay / 2);
        }
        
        return result;
      } catch (error) {
        lastError = error;
        attempt++;
        
        // Record failed request
        this.recordRequest(component, startTime, false);
        
        // If this was the last attempt, throw the error
        if (attempt >= this.maxAttempts) {
          throw error;
        }
        
        // Calculate delay for next attempt
        const delay = this.getDelay(attempt);
        
        // Log the retry (in a real system, this would go to a monitoring system)
        console.warn(`[RateLimiter] Retrying ${component} (attempt ${attempt + 1}/${this.maxAttempts}) after ${delay}ms. Error: ${error.message}`);
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }
  
  /**
   * Get current system status
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      failClosed: this.failClosed,
      currentLoad: this.currentLoad,
      maxLoad: this.maxLoad,
      failClosedThreshold: this.failClosedThreshold,
      recoveryDelay: this.recoveryDelay,
      componentLoads: Object.fromEntries(this.componentLoads),
      recentRequests: this.requestTimes.slice(-10)
    };
  }
  
  /**
   * Reset the rate limiter state
   */
  reset() {
    this.currentLoad = 0;
    this.failClosed = false;
    this.recoveryStartTime = null;
    this.recoveryDelay = this.initialDelay;
    this.componentLoads.clear();
    this.requestTimes = [];
  }
}

export default ExponentialRateLimiter;
