import { createHash } from 'crypto';
import { setTimeout } from 'timers/promises';

/**
 * Central Rate Limiter for SAOS Runtime
 * Implements adaptive rate limiting, thundering herd prevention, fail-closed,
 * and human intervention capabilities.
 */
class CentralRateLimiter {
  constructor(config = {}) {
    this.config = {
      // Adaptive rate control
      minRate: config.minRate ?? 5, // Minimum allowed requests per second
      maxRate: config.maxRate ?? 100, // Maximum allowed requests per second
      adaptationFactor: config.adaptationFactor ?? 0.1, // How quickly we adapt to load
      
      // Thundering herd prevention
      baseBackoffMs: config.baseBackoffMs ?? 100, // Base backoff time in ms
      maxBackoffMs: config.maxBackoffMs ?? 10000, // Maximum backoff time in ms
      backoffFactor: config.backoffFactor ?? 1.5, // Exponential backoff multiplier
      
      // Fail-closed mechanism
      failClosedThreshold: config.failClosedThreshold ?? 10, // Consecutive failures before closing
      failClosedRecoveryAttempts: config.failClosedRecoveryAttempts ?? 3,
      
      // Monitoring
      healthCheckInterval: config.healthCheckInterval ?? 30000, // 30 seconds
      
      // Human intervention
      overrideEnabled: config.overrideEnabled ?? true,
      
      // Defaults
      ...config
    };
    
    this.state = {
      currentRate: this.config.minRate,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      isFailClosed: false,
      lastAdjustment: Date.now(),
      requestHistory: [],
      overrideActive: false,
      overrideRate: null
    };
    
    this.initialize();
  }
  
  initialize() {
    // Start health check loop
    setInterval(() => this.performHealthCheck(), this.config.healthCheckInterval);
    
    // Initialize request history
    this.state.requestHistory = Array(60).fill(null).map(() => ({
      timestamp: Date.now(),
      success: 0,
      failure: 0
    }));
  }
  
  /**
   * Main entry point for rate limiting
   */
  async acquirePermit(service, priority = 'normal') {
    if (this.state.isFailClosed && !this.state.overrideActive) {
      throw new Error('System is in fail-closed state - human intervention required');
    }
    
    const effectiveRate = this.state.overrideActive ? 
      this.state.overrideRate : this.state.currentRate;
    
    // Calculate wait time based on current rate and position in queue
    const waitTime = this.calculateWaitTime(effectiveRate);
    
    if (waitTime > 0) {
      // Implement thundering herd prevention with exponential backoff
      const backoff = this.calculateBackoff(service);
      await setTimeout(backoff);
    }
    
    // Record the attempt
    this.recordAttempt(service, priority);
    
    return {
      permit: true,
      waitTime,
      backoff,
      currentRate: effectiveRate,
      timestamp: Date.now()
    };
  }
  
  /**
   * Calculate wait time based on current rate
   */
  calculateWaitTime(rate) {
    const now = Date.now();
    const windowStart = now - 1000; // 1 second window
    
    // Count successful acquisitions in the last second
    const recentAcquisitions = this.state.requestHistory.filter(
      entry => entry.timestamp > windowStart && entry.success === 1
    ).length;
    
    // If we've exceeded the rate, calculate wait time
    if (recentAcquisitions >= rate) {
      const excess = recentAcquisitions - rate + 1;
      return Math.min(1000, excess * (1000 / rate));
    }
    
    return 0;
  }
  
  /**
   * Calculate backoff time for thundering herd prevention
   */
  calculateBackoff(service) {
    // Get service-specific backoff state
    const serviceBackoff = this.getServiceBackoff(service);
    
    // Calculate backoff with exponential backoff
    const backoff = Math.min(
      this.config.maxBackoffMs,
      this.config.baseBackoffMs * Math.pow(this.config.backoffFactor, serviceBackoff.attempts)
    );
    
    // Reset backoff after successful execution
    if (serviceBackoff.success) {
      serviceBackoff.attempts = 0;
      serviceBackoff.success = false;
    } else {
      serviceBackoff.attempts++;
    }
    
    return backoff;
  }
  
  /**
   * Get or create service backoff state
   */
  getServiceBackoff(service) {
    if (!this.serviceBackoffs) {
      this.serviceBackoffs = {};
    }
    
    if (!this.serviceBackoffs[service]) {
      this.serviceBackoffs[service] = {
        attempts: 0,
        success: false
      };
    }
    
    return this.serviceBackoffs[service];
  }
  
  /**
   * Record an attempt (success or failure)
   */
  recordAttempt(service, priority, success = true) {
    const now = Date.now();
    
    // Update request history
    const currentWindow = this.state.requestHistory[this.state.requestHistory.length - 1];
    
    if (now - currentWindow.timestamp >= 1000) {
      // Create new time window
      this.state.requestHistory.push({
        timestamp: now,
        success: success ? 1 : 0,
        failure: success ? 0 : 1
      });
      
      // Keep only last 60 windows (1 minute)
      if (this.state.requestHistory.length > 60) {
        this.state.requestHistory.shift();
      }
    } else {
      // Update current window
      if (success) {
        currentWindow.success++;
      } else {
        currentWindow.failure++;
      }
    }
    
    // Update consecutive counters
    if (success) {
      this.state.consecutiveSuccesses++;
      this.state.consecutiveFailures = 0;
      
      // Mark service backoff as successful
      const serviceBackoff = this.getServiceBackoff(service);
      serviceBackoff.success = true;
    } else {
      this.state.consecutiveFailures++;
      this.state.consecutiveSuccesses = 0;
    }
    
    // Check for fail-closed condition
    if (this.state.consecutiveFailures >= this.config.failClosedThreshold) {
      this.enterFailClosedState();
    }
    
    // Adapt rate based on success/failure pattern
    this.adaptRate();
  }
  
  /**
   * Adapt the current rate based on system load
   */
  adaptRate() {
    const now = Date.now();
    const timeSinceLastAdjustment = now - this.state.lastAdjustment;
    
    // Only adjust every 5 seconds
    if (timeSinceLastAdjustment < 5000) {
      return;
    }
    
    // Calculate success rate over last minute
    const recentRequests = this.state.requestHistory.filter(
      entry => entry.timestamp > (now - 60000)
    );
    
    const totalRequests = recentRequests.reduce(
      (sum, entry) => sum + entry.success + entry.failure, 0
    );
    
    if (totalRequests === 0) return;
    
    const totalSuccesses = recentRequests.reduce(
      (sum, entry) => sum + entry.success, 0
    );
    
    const successRate = totalSuccesses / totalRequests;
    
    // Adjust rate based on success rate
    if (successRate > 0.9 && this.state.currentRate < this.config.maxRate) {
      // Increase rate if success is high
      const increase = Math.ceil(
        this.config.adaptationFactor * (this.config.maxRate - this.state.currentRate)
      );
      this.state.currentRate = Math.min(
        this.config.maxRate,
        this.state.currentRate + increase
      );
    } else if (successRate < 0.7 && this.state.currentRate > this.config.minRate) {
      // Decrease rate if failure rate is high
      const decrease = Math.ceil(
        this.config.adaptationFactor * (this.state.currentRate - this.config.minRate)
      );
      this.state.currentRate = Math.max(
        this.config.minRate,
        this.state.currentRate - decrease
      );
    }
    
    this.state.lastAdjustment = now;
  }
  
  /**
   * Enter fail-closed state
   */
  enterFailClosedState() {
    this.state.isFailClosed = true;
    this.state.consecutiveFailures = 0;
    
    // Log the event
    console.error(`[${new Date().toISOString()}] System entering fail-closed state after ${this.config.failClosedThreshold} consecutive failures`);
    
    // Emit alert for human intervention
    this.emitAlert('fail-closed-triggered', {
      consecutiveFailures: this.config.failClosedThreshold,
      currentRate: this.state.currentRate,
      timestamp: Date.now()
    });
  }
  
  /**
   * Attempt to recover from fail-closed state
   */
  async attemptRecovery() {
    if (!this.state.isFailClosed) {
      return true; // Already recovered
    }
    
    this.state.consecutiveSuccesses = 0;
    
    // Try to execute a simple test operation
    try {
      // Use a minimal operation to test system health
      const testResult = await this.performHealthCheck(true);
      
      if (testResult.healthy) {
        this.state.consecutiveSuccesses++;
        
        if (this.state.consecutiveSuccesses >= this.config.failClosedRecoveryAttempts) {
          this.exitFailClosedState();
          return true;
        }
      }
      
      return false;
    } catch (error) {
      this.state.consecutiveSuccesses = 0;
      return false;
    }
  }
  
  /**
   * Exit fail-closed state
   */
  exitFailClosedState() {
    this.state.isFailClosed = false;
    this.state.consecutiveFailures = 0;
    
    // Log the event
    console.log(`[${new Date().toISOString()}] System exiting fail-closed state after recovery`);
    
    // Emit alert
    this.emitAlert('fail-closed-recovered', {
      recoveryAttempts: this.config.failClosedRecoveryAttempts,
      currentRate: this.state.currentRate,
      timestamp: Date.now()
    });
  }
  
  /**
   * Perform health check
   */
  async performHealthCheck(isRecoveryTest = false) {
    try {
      // In a real implementation, this would check various system health indicators
      // For now, we'll simulate with a simple check
      
      // Check if core services are responsive
      const services = [
        'hive-custody',
        'blurt-revival',
        'dex-anchor',
        'pulse-generator'
      ];
      
      const results = await Promise.allSettled(
        services.map(service => this.checkServiceHealth(service))
      );
      
      const healthyCount = results.filter(result => result.status === 'fulfilled' && result.value.healthy).length;
      const isHealthy = healthyCount / services.length >= 0.75; // 75% healthy threshold
      
      return {
        healthy: isHealthy,
        healthyCount,
        totalCount: services.length,
        isRecoveryTest
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        isRecoveryTest
      };
    }
  }
  
  /**
   * Check individual service health
   */
  async checkServiceHealth(service) {
    // In a real implementation, this would make actual health check calls
    // For now, we'll simulate with a simple random response
    
    // Simulate occasional failures
    const isHealthy = Math.random() > 0.1; // 90% chance of being healthy
    
    return {
      service,
      healthy: isHealthy,
      timestamp: Date.now()
    };
  }
  
  /**
   * Human intervention methods
   */
  enableOverride(rate) {
    if (!this.config.overrideEnabled) {
      throw new Error('Human override is disabled in configuration');
    }
    
    this.state.overrideActive = true;
    this.state.overrideRate = rate;
    
    this.emitAlert('override-enabled', {
      rate,
      timestamp: Date.now()
    });
    
    return true;
  }
  
  disableOverride() {
    this.state.overrideActive = false;
    this.state.overrideRate = null;
    
    this.emitAlert('override-disabled', {
      timestamp: Date.now()
    });
    
    return true;
  }
  
  /**
   * Emit alert (in a real implementation, this would connect to notification system)
   */
  emitAlert(type, data) {
    const alert = {
      type,
      timestamp: Date.now(),
      data,
      system: 'saos-runtime',
      component: 'central-rate-limiter'
    };
    
    // In a real implementation, this would send to an alert system
    console.log('ALERT:', alert);
    
    // Could also emit to event bus or send to monitoring system
    return alert;
  }
  
  /**
   * Get current status
   */
  getStatus() {
    return {
      currentRate: this.state.currentRate,
      minRate: this.config.minRate,
      maxRate: this.config.maxRate,
      isFailClosed: this.state.isFailClosed,
      consecutiveFailures: this.state.consecutiveFailures,
      consecutiveSuccesses: this.state.consecutiveSuccesses,
      overrideActive: this.state.overrideActive,
      overrideRate: this.state.overrideRate,
      requestHistory: this.state.requestHistory,
      timestamp: Date.now()
    };
  }
}

export default CentralRateLimiter;

/**
 * Example usage:
 * 
 * import CentralRateLimiter from './central-rate-limiter.mjs';
 * 
 * // Initialize with configuration
 * const limiter = new CentralRateLimiter({
 *   minRate: 10,
 *   maxRate: 50,
 *   failClosedThreshold: 5
 * });
 * 
 * // Acquire permits for services
 * async function processRequest(service) {
 *   try {
 *     const permit = await limiter.acquirePermit(service);
 *     
 *     // Process the request
 *     console.log(`Processing ${service} request at rate ${permit.currentRate}`);
 *     
 *     // Record success
 *     limiter.recordAttempt(service, 'normal', true);
 *     
 *     return { success: true };
 *   } catch (error) {
 *     console.error(`Failed to process ${service} request:`, error.message);
 *     
 *     // Record failure
 *     limiter.recordAttempt(service, 'normal', false);
 *     
 *     return { success: false, error: error.message };
 *   }
 * }
 * 
 * // Human intervention
 * limiter.enableOverride(30); // Set rate to 30 requests/second
 * limiter.disableOverride(); // Return to adaptive rate control
 * 
 * // Check status
 * console.log('Limiter status:', limiter.getStatus());
 */