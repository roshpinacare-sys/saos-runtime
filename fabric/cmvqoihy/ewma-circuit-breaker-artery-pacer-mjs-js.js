// File: agents/agent-9-insurance/ewma-circuit-breaker-artery-pacer.mjs

import { createHash } from 'crypto';
import { setTimeout } from 'timers/promises';

/**
 * EWMA Circuit Breaker with Artery Pacer
 * 
 * Dynamic rate limiting algorithm combining EWMA monitoring with:
 * - Circuit breaker with fail-closed capability
 * - Aggressive recovery to prevent thundering herd
 * - Dynamic request rate adjustment based on EWMA metrics
 * - Square failure prevention in high-load scenarios
 * 
 * @author SAOS Runtime System
 * @version 1.0.0
 * @license MIT
 */

class EWMAArteryPacer {
  /**
   * Initialize the EWMA Circuit Breaker with Artery Pacer
   * @param {Object} config - Configuration object
   * @param {number} config.requestThreshold - Threshold for closing circuit (default: 10)
   * @param {number} config.errorThreshold - Error rate threshold (default: 0.5)
   * @param {number} config.coolDownTime - Cool down period in ms (default: 5000)
   * @param {number} config.minRate - Minimum request rate (default: 1)
   * @param {number} config.maxRate - Maximum request rate (default: 100)
   * @param {number} config.ewmaAlpha - EWMA alpha value (default: 0.2)
   * @param {number} config.recoveryFactor - Recovery multiplier (default: 1.5)
   */
  constructor({
    requestThreshold = 10,
    errorThreshold = 0.5,
    coolDownTime = 5000,
    minRate = 1,
    maxRate = 100,
    ewmaAlpha = 0.2,
    recoveryFactor = 1.5
  } = {}) {
    // Circuit breaker state
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    
    // Rate limiting state
    this.currentRate = minRate;
    this.minRate = minRate;
    this.maxRate = maxRate;
    this.lastRequestTime = 0;
    this.requestQueue = [];
    
    // EWMA state
    this.ewmaErrorRate = 0;
    this.ewmaResponseTime = 0;
    this.ewmaAlpha = ewmaAlpha;
    this.responseTimes = [];
    
    // Configuration
    this.requestThreshold = requestThreshold;
    this.errorThreshold = errorThreshold;
    this.coolDownTime = coolDownTime;
    this.recoveryFactor = recoveryFactor;
    
    // Metrics
    this.totalRequests = 0;
    this.totalErrors = 0;
    this.totalResponseTime = 0;
  }
  
  /**
   * Execute a function with rate limiting and circuit breaker protection
   * @param {Function} fn - Function to execute
   * @param {Object} options - Execution options
   * @returns {Promise<any>} - Result of the function execution
   */
  async execute(fn, options = {}) {
    this.totalRequests++;
    
    // Check if circuit is open
    if (this.state === 'OPEN') {
      if (this._shouldAttemptRecovery()) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit is OPEN - requests are blocked');
      }
    }
    
    // Check rate limit
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    const requiredDelay = 1000 / this.currentRate;
    
    if (timeSinceLastRequest < requiredDelay) {
      await setTimeout(requiredDelay - timeSinceLastRequest);
    }
    
    this.lastRequestTime = Date.now();
    
    try {
      const startTime = Date.now();
      const result = await fn();
      const responseTime = Date.now() - startTime;
      
      // Update metrics
      this.successCount++;
      this.totalResponseTime += responseTime;
      this.responseTimes.push(responseTime);
      if (this.responseTimes.length > 100) {
        this.responseTimes.shift();
      }
      
      // Update EWMA
      this._updateEWMA(responseTime, false);
      
      // Check if we should close the circuit
      if (this.state === 'HALF_OPEN') {
        this.state = 'CLOSED';
        this.failureCount = 0;
      }
      
      // Adjust rate based on EWMA
      this._adjustRate();
      
      return result;
    } catch (error) {
      this.totalErrors++;
      this.failureCount++;
      this.lastFailureTime = Date.now();
      
      // Update EWMA
      this._updateEWMA(Date.now() - this.lastRequestTime, true);
      
      // Check if we should open the circuit
      if (this._shouldOpenCircuit()) {
        this.state = 'OPEN';
      }
      
      // Adjust rate based on EWMA
      this._adjustRate();
      
      throw error;
    }
  }
  
  /**
   * Update EWMA metrics
   * @param {number} responseTime - Response time in ms
   * @param {boolean} isError - Whether the request resulted in an error
   */
  _updateEWMA(responseTime, isError) {
    // Update error rate EWMA
    this.ewmaErrorRate = this.ewmaAlpha * (isError ? 1 : 0) + (1 - this.ewmaAlpha) * this.ewmaErrorRate;
    
    // Update response time EWMA
    this.ewmaResponseTime = this.ewmaAlpha * responseTime + (1 - this.ewmaAlpha) * this.ewmaResponseTime;
  }
  
  /**
   * Adjust the request rate based on EWMA metrics
   */
  _adjustRate() {
    // Calculate new rate based on EWMA metrics
    const errorFactor = Math.max(0.1, 1 - this.ewmaErrorRate * 2);
    const responseFactor = Math.max(0.1, 1 / (1 + this.ewmaResponseTime / 1000));
    
    // Calculate new rate
    let newRate = this.currentRate * errorFactor * responseFactor;
    
    // Apply recovery factor if we're in recovery mode
    if (this.state === 'HALF_OPEN') {
      newRate *= this.recoveryFactor;
    }
    
    // Ensure rate is within bounds
    newRate = Math.max(this.minRate, Math.min(this.maxRate, newRate));
    
    // Smooth rate changes to avoid sudden jumps
    this.currentRate = this.currentRate * 0.8 + newRate * 0.2;
  }
  
  /**
   * Check if the circuit should be opened
   * @returns {boolean}
   */
  _shouldOpenCircuit() {
    return (
      this.failureCount >= this.requestThreshold ||
      (this.ewmaErrorRate > this.errorThreshold && this.failureCount > 0)
    );
  }
  
  /**
   * Check if we should attempt recovery
   * @returns {boolean}
   */
  _shouldAttemptRecovery() {
    return (
      this.state === 'OPEN' &&
      (Date.now() - this.lastFailureTime) > this.coolDownTime
    );
  }
  
  /**
   * Get current metrics
   * @returns {Object}
   */
  getMetrics() {
    return {
      state: this.state,
      currentRate: this.currentRate,
      ewmaErrorRate: this.ewmaErrorRate,
      ewmaResponseTime: this.ewmaResponseTime,
      totalRequests: this.totalRequests,
      totalErrors: this.totalErrors,
      failureCount: this.failureCount,
      successCount: this.successCount,
      minRate: this.minRate,
      maxRate: this.maxRate
    };
  }
  
  /**
   * Reset the circuit breaker
   */
  reset() {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.currentRate = this.minRate;
    this.ewmaErrorRate = 0;
    this.ewmaResponseTime = 0;
    this.responseTimes = [];
    this.totalRequests = 0;
    this.totalErrors = 0;
    this.totalResponseTime = 0;
  }
}

export default EWMAArteryPacer;

// Unit tests
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    console.log('Running EWMA Circuit Breaker with Artery Pacer tests...');
    
    // Test 1: Basic functionality
    console.log('\nTest 1: Basic functionality');
    const pacer1 = new EWMAArteryPacer({ minRate: 10, maxRate: 20 });
    
    let callCount = 0;
    const mockFn = async () => {
      callCount++;
      return `result-${callCount}`;
    };
    
    try {
      const result1 = await pacer1.execute(mockFn);
      console.log('Result 1:', result1);
      
      const result2 = await pacer1.execute(mockFn);
      console.log('Result 2:', result2);
      
      console.log('Metrics:', pacer1.getMetrics());
    } catch (error) {
      console.error('Test 1 failed:', error);
    }
    
    // Test 2: Circuit breaker with failures
    console.log('\nTest 2: Circuit breaker with failures');
    const pacer2 = new EWMAArteryPacer({ 
      requestThreshold: 3,
      errorThreshold: 0.5,
      coolDownTime: 1000
    });
    
    let errorCount = 0;
    const failingFn = async () => {
      errorCount++;
      if (errorCount <= 3) {
        throw new Error(`Simulated error ${errorCount}`);
      }
      return `success-after-error-${errorCount}`;
    };
    
    try {
      // First few calls should fail
      for (let i = 1; i <= 4; i++) {
        try {
          await pacer2.execute(failingFn);
        } catch (error) {
          console.log(`Call ${i} failed as expected:`, error.message);
        }
      }
      
      console.log('State after failures:', pacer2.state);
      console.log('Metrics after failures:', pacer2.getMetrics());
      
      // Wait for cooldown period
      console.log('Waiting for cooldown period...');
      await setTimeout(1100);
      
      // Next call should trigger recovery attempt
      try {
        const result = await pacer2.execute(failingFn);
        console.log('Recovery attempt result:', result);
        console.log('State after recovery:', pacer2.state);
      } catch (error) {
        console.log('Recovery attempt failed:', error.message);
      }
    } catch (error) {
      console.error('Test 2 failed:', error);
    }
    
    // Test 3: Rate limiting
    console.log('\nTest 3: Rate limiting');
    const pacer3 = new EWMAArteryPacer({ minRate: 5, maxRate: 10 });
    
    const startTime = Date.now();
    let callCount3 = 0;
    
    const rateLimitedFn = async () => {
      callCount3++;
      return `call-${callCount3}`;
    };
    
    try {
      // Execute multiple calls
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(pacer3.execute(rateLimitedFn));
      }
      
      await Promise.all(promises);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      const actualRate = (10 / duration) * 1000;
      
      console.log(`Executed 10 calls in ${duration}ms`);
      console.log(`Actual rate: ${actualRate.toFixed(2)} calls/sec`);
      console.log(`Expected rate: ${pacer3.currentRate} calls/sec`);
      console.log('Metrics:', pacer3.getMetrics());
    } catch (error) {
      console.error('Test 3 failed:', error);
    }
    
    // Test 4: EWMA adjustment
    console.log('\nTest 4: EWMA adjustment');
    const pacer4 = new EWMAArteryPacer({ 
      minRate: 5, 
      maxRate: 20,
      ewmaAlpha: 0.3
    });
    
    let callCount4 = 0;
    
    // First, execute some successful calls
    for (let i = 0; i < 5; i++) {
      await pacer4.execute(async () => {
        callCount4++;
        return `success-${callCount4}`;
      });
    }
    
    console.log('Metrics after successful calls:', pacer4.getMetrics());
    
    // Then, execute some failing calls
    for (let i = 0; i < 3; i++) {
      try {
        await pacer4.execute(async () => {
          callCount4++;
          throw new Error(`Simulated error ${callCount4}`);
        });
      } catch (error) {
        console.log(`Failed call ${callCount4} as expected`);
      }
    }
    
    console.log('Metrics after mixed calls:', pacer4.getMetrics());
    
    console.log('\nAll tests completed.');
  })();
}
