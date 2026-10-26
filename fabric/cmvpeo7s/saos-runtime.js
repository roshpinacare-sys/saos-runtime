import { createHash } from 'crypto';
import { sleep } from './utils.mjs';

/**
 * Distributed Pacer Module for saos-runtime
 * 
 * This module implements rate limiting and distributed error handling
 * for SAOS runtime agents. It replaces artery-pacer.mjs with a more
 * robust, distributed approach that can operate independently on each agent.
 * 
 * Key features:
 * - Rate limiting with configurable thresholds
 * - Distributed error handling and recovery
 * - Self-healing mechanisms
 * - State synchronization across agents
 * 
 * @module distributed-pacer
 * @version 1.0.0
 * @license MIT
 */

/**
 * Configuration for the distributed pacer
 * @typedef {Object} PacerConfig
 * @property {number} maxRequestsPerMinute - Maximum requests per minute per agent
 * @property {number} maxConcurrentRequests - Maximum concurrent requests per agent
 * @property {number} retryDelayMs - Delay between retries in milliseconds
 * @property {number} maxRetries - Maximum number of retries for failed requests
 * @property {number} healthCheckIntervalMs - Interval for health checks in milliseconds
 * @property {number} circuitBreakerThreshold - Threshold for opening circuit breaker
 * @property {number} circuitBreakerTimeoutMs - Timeout for circuit breaker in milliseconds
 */

/**
 * Represents a single request being tracked by the pacer
 * @typedef {Object} RequestTracker
 * @property {string} id - Unique request ID
 * @property {number} timestamp - Request timestamp
 * @property {number} retryCount - Number of retries attempted
 * @property {boolean} isActive - Whether request is active
 * @property {string} agentId - ID of the agent handling the request
 */

/**
 * Distributed Pacer class
 */
class DistributedPacer {
  /**
   * Create a new DistributedPacer instance
   * @param {PacerConfig} config - Configuration for the pacer
   * @param {string} agentId - Unique identifier for this agent
   */
  constructor(config, agentId) {
    this.config = {
      maxRequestsPerMinute: config.maxRequestsPerMinute || 60,
      maxConcurrentRequests: config.maxConcurrentRequests || 5,
      retryDelayMs: config.retryDelayMs || 1000,
      maxRetries: config.maxRetries || 3,
      healthCheckIntervalMs: config.healthCheckIntervalMs || 30000,
      circuitBreakerThreshold: config.circuitBreakerThreshold || 5,
      circuitBreakerTimeoutMs: config.circuitBreakerTimeoutMs || 60000,
      ...config
    };
    
    this.agentId = agentId || `agent-${Math.random().toString(36).substr(2, 9)}`;
    this.requestQueue = [];
    this.activeRequests = new Map();
    this.failedRequests = 0;
    this.lastMinuteRequests = 0;
    this.lastMinuteReset = Date.now();
    this.circuitOpen = false;
    this.circuitOpenTime = 0;
    this.healthCheckInterval = null;
    
    // Start health check
    this.startHealthCheck();
  }

  /**
   * Start periodic health checks
   */
  startHealthCheck() {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, this.config.healthCheckIntervalMs);
  }

  /**
   * Stop health checks
   */
  stopHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Perform a health check
   */
  async performHealthCheck() {
    try {
      // Reset minute counter if needed
      this.resetMinuteCounterIfNeeded();
      
      // Check circuit breaker status
      this.checkCircuitBreaker();
      
      // Process any queued requests
      this.processQueue();
      
      // Log health status
      this.logHealthStatus();
    } catch (error) {
      console.error(`Health check failed for agent ${this.agentId}:`, error);
    }
  }

  /**
   * Reset the minute counter if needed
   */
  resetMinuteCounterIfNeeded() {
    const now = Date.now();
    if (now - this.lastMinuteReset >= 60000) {
      this.lastMinuteRequests = 0;
      this.lastMinuteReset = now;
    }
  }

  /**
   * Check circuit breaker status
   */
  checkCircuitBreaker() {
    if (this.circuitOpen) {
      if (Date.now() - this.circuitOpenTime >= this.config.circuitBreakerTimeoutMs) {
        this.circuitOpen = false;
        console.log(`Circuit breaker closed for agent ${this.agentId}`);
      }
    } else if (this.failedRequests >= this.config.circuitBreakerThreshold) {
      this.circuitOpen = true;
      this.circuitOpenTime = Date.now();
      console.log(`Circuit breaker opened for agent ${this.agentId}`);
    }
  }

  /**
   * Log current health status
   */
  logHealthStatus() {
    const status = {
      agentId: this.agentId,
      activeRequests: this.activeRequests.size,
      queuedRequests: this.requestQueue.length,
      failedRequests: this.failedRequests,
      circuitOpen: this.circuitOpen,
      lastMinuteRequests: this.lastMinuteRequests,
      timestamp: new Date().toISOString()
    };
    
    // In a real implementation, this would be sent to a monitoring system
    console.log('Pacer health status:', status);
  }

  /**
   * Execute a request with rate limiting and error handling
   * @param {Function} requestFn - Function to execute the request
   * @param {Object} options - Request options
   * @returns {Promise<any>} - Result of the request
   */
  async execute(requestFn, options = {}) {
    const requestId = this.generateRequestId();
    
    // Check if we can accept more requests
    if (!this.canAcceptRequest()) {
      // Queue the request
      return new Promise((resolve, reject) => {
        this.requestQueue.push({
          id: requestId,
          requestFn,
          options,
          resolve,
          reject,
          timestamp: Date.now()
        });
      });
    }
    
    // Track the request
    const tracker = this.trackRequest(requestId);
    
    try {
      // Execute the request with retry logic
      const result = await this.executeWithRetry(requestFn, options, tracker);
      this.successRequest(requestId);
      return result;
    } catch (error) {
      this.failRequest(requestId, error);
      throw error;
    }
  }

  /**
   * Execute a request with retry logic
   * @param {Function} requestFn - Function to execute the request
   * @param {Object} options - Request options
   * @param {RequestTracker} tracker - Request tracker
   * @returns {Promise<any>} - Result of the request
   */
  async executeWithRetry(requestFn, options, tracker) {
    let lastError;
    
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        // Check if we should retry
        if (attempt > 0) {
          await sleep(this.config.retryDelayMs * Math.pow(2, attempt - 1));
        }
        
        // Execute the request
        const result = await requestFn();
        return result;
      } catch (error) {
        lastError = error;
        tracker.retryCount++;
        
        // Log retry attempt
        console.log(`Request ${tracker.id} failed (attempt ${attempt + 1}/${this.config.maxRetries}):`, error.message);
        
        // If this is the last attempt, throw the error
        if (attempt === this.config.maxRetries) {
          throw error;
        }
        
        // Check if we should continue retrying
        if (!this.shouldRetry(error)) {
          throw error;
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Check if we can accept a new request
   * @returns {boolean} - Whether we can accept a new request
   */
  canAcceptRequest() {
    this.resetMinuteCounterIfNeeded();
    
    // Check circuit breaker
    if (this.circuitOpen) {
      return false;
    }
    
    // Check concurrent requests
    if (this.activeRequests.size >= this.config.maxConcurrentRequests) {
      return false;
    }
    
    // Check per-minute requests
    if (this.lastMinuteRequests >= this.config.maxRequestsPerMinute) {
      return false;
    }
    
    return true;
  }

  /**
   * Track a new request
   * @param {string} requestId - Request ID
   * @returns {RequestTracker} - Request tracker
   */
  trackRequest(requestId) {
    const tracker = {
      id: requestId,
      timestamp: Date.now(),
      retryCount: 0,
      isActive: true,
      agentId: this.agentId
    };
    
    this.activeRequests.set(requestId, tracker);
    this.lastMinuteRequests++;
    
    return tracker;
  }

  /**
   * Mark a request as successful
   * @param {string} requestId - Request ID
   */
  successRequest(requestId) {
    const tracker = this.activeRequests.get(requestId);
    if (tracker) {
      tracker.isActive = false;
      this.activeRequests.delete(requestId);
    }
  }

  /**
   * Mark a request as failed
   * @param {string} requestId - Request ID
   * @param {Error} error - Error that occurred
   */
  failRequest(requestId, error) {
    const tracker = this.activeRequests.get(requestId);
    if (tracker) {
      tracker.isActive = false;
      this.activeRequests.delete(requestId);
      this.failedRequests++;
    }
  }

  /**
   * Process queued requests
   */
  processQueue() {
    while (this.requestQueue.length > 0 && this.canAcceptRequest()) {
      const queuedRequest = this.requestQueue.shift();
      
      // Execute the queued request
      this.execute(queuedRequest.requestFn, queuedRequest.options)
        .then(result => queuedRequest.resolve(result))
        .catch(error => queuedRequest.reject(error));
    }
  }

  /**
   * Generate a unique request ID
   * @returns {string} - Unique request ID
   */
  generateRequestId() {
    return `req-${this.agentId}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
  }

  /**
   * Check if we should retry a failed request
   * @param {Error} error - Error that occurred
   * @returns {boolean} - Whether we should retry
   */
  shouldRetry(error) {
    // Retry on network errors
    if (error.code === 'ECONNRESET' || 
        error.code === 'ENOTFOUND' || 
        error.code === 'ETIMEDOUT') {
      return true;
    }
    
    // Retry on 5xx server errors
    if (error.status && error.status >= 500 && error.status < 600) {
      return true;
    }
    
    // Don't retry on client errors
    if (error.status && error.status >= 400 && error.status < 500) {
      return false;
    }
    
    // Default to retrying
    return true;
  }

  /**
   * Get current status of the pacer
   * @returns {Object} - Current status
   */
  getStatus() {
    return {
      agentId: this.agentId,
      activeRequests: this.activeRequests.size,
      queuedRequests: this.requestQueue.length,
      failedRequests: this.failedRequests,
      circuitOpen: this.circuitOpen,
      lastMinuteRequests: this.lastMinuteRequests,
      config: this.config
    };
  }
}

export { DistributedPacer };
