import { createHash } from 'crypto';
import { randomBytes } from 'crypto';
import { setTimeout } from 'timers/promises';

/**
 * SAOS Rate Limiter with Thundering Herd Prevention
 * 
 * This module implements a dynamic rate limiting mechanism for the SAOS runtime system.
 * Features:
 * 1. Exponential backoff algorithm to prevent thundering herd
 * 2. Dynamic rate adjustment based on system load
 * 3. Fail-closed mechanism under critical load
 * 4. Monitoring and reporting system
 * 
 * Architecture:
 * - RateLimiter class: Main controller for rate limiting decisions
 * - CircuitBreaker: Monitors system health and triggers fail-closed
 * - BackoffStrategy: Implements exponential backoff with jitter
 * - MetricsCollector: Tracks and reports system metrics
 * 
 * File: agents/agent-9-insurance/rate-limiter.mjs
 * Author: SAOS Runtime Team
 * Version: 1.0.0
 */

class BackoffStrategy {
  constructor(minDelay = 100, maxDelay = 30000, maxRetries = 5) {
    this.minDelay = minDelay;
    this.maxDelay = maxDelay;
    this.maxRetries = maxRetries;
    this.base = 2; // exponential base
  }

  calculateDelay(retryCount) {
    if (retryCount >= this.maxRetries) {
      return this.maxDelay;
    }
    
    // Exponential backoff with jitter
    const exponentialDelay = Math.min(
      this.minDelay * Math.pow(this.base, retryCount),
      this.maxDelay
    );
    
    // Add jitter to synchronize processes
    const jitter = Math.random() * exponentialDelay * 0.1;
    return Math.floor(exponentialDelay + jitter);
  }
}

class CircuitBreaker {
  constructor(threshold = 5, timeout = 60000) {
    this.threshold = threshold; // failure threshold to open circuit
    this.timeout = timeout; // timeout before attempting reset
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failures = 0;
    this.lastFailureTime = null;
  }

  recordFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.threshold) {
      this.state = 'OPEN';
    }
  }

  recordSuccess() {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  allowRequest() {
    if (this.state === 'CLOSED') {
      return true;
    }
    
    if (this.state === 'OPEN') {
      // Check if timeout has passed
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'HALF_OPEN';
        return true;
      }
      return false;
    }
    
    // HALF_OPEN state - allow one request to test
    if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN'; // Reset to OPEN after test request
      return true;
    }
    
    return false;
  }
}

class MetricsCollector {
  constructor() {
    this.metrics = {
      requests: 0,
      allowed: 0,
      denied: 0,
      failures: 0,
      backoffEvents: 0,
      systemLoad: 0,
      timestamp: Date.now()
    };
    this.history = [];
    this.maxHistory = 100;
  }

  recordRequest(allowed, reason = '') {
    this.metrics.requests++;
    if (allowed) {
      this.metrics.allowed++;
    } else {
      this.metrics.denied++;
      if (reason === 'backoff') {
        this.metrics.backoffEvents++;
      }
    }
  }

  recordFailure() {
    this.metrics.failures++;
  }

  updateSystemLoad(load) {
    this.metrics.systemLoad = load;
  }

  getMetrics() {
    return { ...this.metrics };
  }

  recordHistory() {
    this.history.push({
      ...this.metrics,
      timestamp: Date.now()
    });
    
    // Keep only the most recent entries
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }

  getHistory() {
    return [...this.history];
  }
}

class RateLimiter {
  constructor(options = {}) {
    this.options = {
      minDelay: options.minDelay || 100, // ms
      maxDelay: options.maxDelay || 30000, // ms
      maxRetries: options.maxRetries || 5,
      failureThreshold: options.failureThreshold || 5,
      failureTimeout: options.failureTimeout || 60000, // ms
      systemLoadThreshold: options.systemLoadThreshold || 0.8, // 80%
      dynamicAdjustmentInterval: options.dynamicAdjustmentInterval || 10000, // 10s
      ...options
    };
    
    this.backoffStrategy = new BackoffStrategy(
      this.options.minDelay,
      this.options.maxDelay,
      this.options.maxRetries
    );
    
    this.circuitBreaker = new CircuitBreaker(
      this.options.failureThreshold,
      this.options.failureTimeout
    );
    
    this.metricsCollector = new MetricsCollector();
    this.currentRate = 1.0; // Initial rate multiplier
    this.lastAdjustmentTime = Date.now();
    
    // Start dynamic adjustment process
    this.startDynamicAdjustment();
  }

  startDynamicAdjustment() {
    setInterval(() => {
      this.adjustRateDynamically();
    }, this.options.dynamicAdjustmentInterval);
  }

  adjustRateDynamically() {
    const now = Date.now();
    const timeSinceLastAdjustment = now - this.lastAdjustmentTime;
    
    if (timeSinceLastAdjustment < this.options.dynamicAdjustmentInterval) {
      return;
    }
    
    const metrics = this.metricsCollector.getMetrics();
    const load = metrics.systemLoad;
    
    // Calculate new rate based on system load
    if (load > this.options.systemLoadThreshold) {
      // Reduce rate when system is overloaded
      this.currentRate = Math.max(0.1, this.currentRate * 0.8);
    } else if (load < this.options.systemLoadThreshold * 0.7) {
      // Increase rate when system is underutilized
      this.currentRate = Math.min(2.0, this.currentRate * 1.1);
    }
    
    this.lastAdjustmentTime = now;
    
    // Record metrics periodically
    if (now % 5000 < this.options.dynamicAdjustmentInterval) {
      this.metricsCollector.recordHistory();
    }
  }

  async executeWithRateLimit(fn, context = {}) {
    const startTime = Date.now();
    
    // Check if circuit breaker allows request
    if (!this.circuitBreaker.allowRequest()) {
      this.metricsCollector.recordRequest(false, 'circuit_breaker');
      throw new Error('Circuit breaker is open. System is under heavy load.');
    }
    
    // Get system load (simulated in this example)
    const systemLoad = this.getSystemLoad();
    this.metricsCollector.updateSystemLoad(systemLoad);
    
    // Apply dynamic rate adjustment
    const adjustedDelay = this.calculateAdjustedDelay();
    
    // If system is overloaded, apply backoff
    if (systemLoad > this.options.systemLoadThreshold) {
      this.metricsCollector.recordRequest(false, 'backoff');
      await setTimeout(adjustedDelay);
      
      // Retry after backoff
      try {
        const result = await fn.call(context);
        this.circuitBreaker.recordSuccess();
        this.metricsCollector.recordRequest(true);
        return result;
      } catch (error) {
        this.circuitBreaker.recordFailure();
        this.metricsCollector.recordFailure();
        throw error;
      }
    }
    
    // System is not overloaded, allow request
    try {
      const result = await fn.call(context);
      this.circuitBreaker.recordSuccess();
      this.metricsCollector.recordRequest(true);
      return result;
    } catch (error) {
      this.circuitBreaker.recordFailure();
      this.metricsCollector.recordFailure();
      throw error;
    } finally {
      const endTime = Date.now();
      const duration = endTime - startTime;
      this.recordExecutionTime(duration);
    }
  }

  calculateAdjustedDelay() {
    // Base delay adjusted by current rate multiplier
    return Math.floor(this.options.minDelay / this.currentRate);
  }

  getSystemLoad() {
    // In a real implementation, this would check actual system metrics
    // For this example, we'll simulate load based on recent metrics
    const metrics = this.metricsCollector.getMetrics();
    
    // Simulate load based on failure rate and request rate
    const failureRate = metrics.failures / Math.max(1, metrics.requests);
    const requestRate = metrics.requests / 60; // requests per minute (simulated)
    
    // Simple simulation: higher failure rate and request rate = higher load
    return Math.min(1.0, failureRate * 0.5 + requestRate * 0.01);
  }

  recordExecutionTime(duration) {
    // Record execution time for analysis
    // In a real implementation, this would be stored in metrics
    if (duration > 1000) {
      // Slow execution might indicate system load
      this.metricsCollector.updateSystemLoad(prev => Math.min(1.0, prev + 0.05));
    }
  }

  getMetrics() {
    return {
      ...this.metricsCollector.getMetrics(),
      currentRate: this.currentRate,
      circuitState: this.circuitBreaker.state,
      systemLoad: this.getSystemLoad()
    };
  }

  getHistory() {
    return this.metricsCollector.getHistory();
  }

  // Method to manually adjust rate based on external factors
  adjustRate(factor) {
    this.currentRate = Math.max(0.1, Math.min(2.0, this.currentRate * factor));
  }
}

// Export for use in SAOS runtime
export { RateLimiter, BackoffStrategy, CircuitBreaker, MetricsCollector };

// Example usage:
/*
const rateLimiter = new RateLimiter({
  minDelay: 100,
  maxDelay: 5000,
  maxRetries: 3,
  systemLoadThreshold: 0.7
});

async function someOperation() {
  // Simulate some work
  await setTimeout(200);
  return 'Operation completed';
}

// Execute with rate limiting
rateLimiter.executeWithRateLimit(someOperation)
  .then(result => console.log(result))
  .catch(error => console.error('Rate limited:', error.message));

// Get metrics
console.log('Current metrics:', rateLimiter.getMetrics());
*/
