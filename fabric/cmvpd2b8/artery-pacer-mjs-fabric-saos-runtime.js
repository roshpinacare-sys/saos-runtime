// artery-pacer.mjs - Adaptive rate limiter with circuit breaker pattern
// Based on ewma-circuit-breaker-artery-pacer-mjs.js but adapted for fabric/

import { createHash } from 'crypto';
import { setTimeout } from 'timers/promises';

/**
 * ArteryPacer - Adaptive rate limiter with circuit breaker pattern
 * Provides controlled execution with dynamic backoff and failure handling
 */
export class ArteryPacer {
  /**
   * @param {Object} config - Configuration object
   * @param {number} [config.minInterval=100] - Minimum interval between executions (ms)
   * @param {number} [config.maxInterval=30000] - Maximum backoff interval (ms)
   * @param {number} [config.successThreshold=5] - Consecutive successes to close circuit
   * @param {number} [config.failureThreshold=3] - Consecutive failures to open circuit
   * @param {number} [config.ewmaAlpha=0.25] - EWMA smoothing factor (0-1)
   * @param {number} [config.initialRate=1000] - Initial execution rate (ms)
   */
  constructor({
    minInterval = 100,
    maxInterval = 30000,
    successThreshold = 5,
    failureThreshold = 3,
    ewmaAlpha = 0.25,
    initialRate = 1000
  } = {}) {
    this.minInterval = minInterval;
    this.maxInterval = maxInterval;
    this.successThreshold = successThreshold;
    this.failureThreshold = failureThreshold;
    this.ewmaAlpha = ewmaAlpha;
    this.currentRate = initialRate;
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.circuitOpen = false;
    this.lastExecutionTime = 0;
    this.executionHistory = [];
    this.contextHash = '';
  }

  /**
   * Update execution context for rate calculation
   * @param {Object} context - Execution context data
   */
  updateContext(context) {
    const contextString = JSON.stringify(context);
    this.contextHash = createHash('sha256').update(contextString).digest('hex');
  }

  /**
   * Record execution result and update state
   * @param {boolean} success - Whether execution succeeded
   * @param {number} executionTime - Execution duration in ms
   */
  recordExecution(success, executionTime = 0) {
    const now = Date.now();
    
    // Update EWMA rate estimate
    if (success) {
      this.consecutiveSuccesses++;
      this.consecutiveFailures = 0;
      
      // Gradually reduce rate when successful
      if (this.consecutiveSuccesses >= this.successThreshold) {
        this.circuitOpen = false;
        this.currentRate = Math.max(
          this.minInterval,
          this.currentRate * (1 - this.ewmaAlpha)
        );
      }
    } else {
      this.consecutiveFailures++;
      this.consecutiveSuccesses = 0;
      
      // Increase rate when failing
      if (this.consecutiveFailures >= this.failureThreshold) {
        this.circuitOpen = true;
        this.currentRate = Math.min(
          this.maxInterval,
          this.currentRate * (1 + this.ewmaAlpha * 2)
        );
      }
    }
    
    // Record execution history
    this.executionHistory.push({
      timestamp: now,
      success,
      executionTime,
      rate: this.currentRate
    });
    
    // Keep only recent history
    this.executionHistory = this.executionHistory.slice(-100);
    
    this.lastExecutionTime = now;
  }

  /**
   * Wait for appropriate delay before next execution
   * @returns {Promise<void>}
   */
  async wait() {
    const now = Date.now();
    const timeSinceLastExec = now - this.lastExecutionTime;
    const delay = Math.max(0, this.currentRate - timeSinceLastExec);
    
    if (this.circuitOpen) {
      console.warn(`[ArteryPacer] Circuit open - waiting ${delay}ms before retry`);
    }
    
    await setTimeout(delay);
  }

  /**
   * Execute callback with pacing and circuit breaker logic
   * @param {Function} fn - Function to execute
   * @param {Object} [context] - Execution context
   * @returns {Promise<any>} - Result of execution
   */
  async execute(fn, context = {}) {
    this.updateContext(context);
    
    // Wait if needed
    await this.wait();
    
    const startTime = Date.now();
    let result;
    let success = false;
    
    try {
      result = await fn();
      success = true;
      return result;
    } catch (error) {
      console.error(`[ArteryPacer] Execution failed:`, error);
      throw error;
    } finally {
      const executionTime = Date.now() - startTime;
      this.recordExecution(success, executionTime);
    }
  }

  /**
   * Get current status
   * @returns {Object} - Status information
   */
  getStatus() {
    return {
      contextHash: this.contextHash,
      currentRate: this.currentRate,
      consecutiveFailures: this.consecutiveFailures,
      consecutiveSuccesses: this.consecutiveSuccesses,
      circuitOpen: this.circuitOpen,
      lastExecutionTime: this.lastExecutionTime,
      minInterval: this.minInterval,
      maxInterval: this.maxInterval,
      successThreshold: this.successThreshold,
      failureThreshold: this.failureThreshold,
      recentHistory: this.executionHistory.slice(-10)
    };
  }
}

/**
 * Create a new pacer instance with system defaults
 * @returns {ArteryPacer}
 */
export function createPacer() {
  return new ArteryPacer({
    minInterval: 100,
    maxInterval: 30000,
    successThreshold: 5,
    failureThreshold: 3,
    ewmaAlpha: 0.25,
    initialRate: 1000
  });
}

// Default export for convenience
export default ArteryPacer;