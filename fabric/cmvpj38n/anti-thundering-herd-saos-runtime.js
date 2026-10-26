import { createHash } from 'crypto';
import { randomBytes } from 'crypto';
import { performance } from 'perf_hooks';

// Core dynamic rate limiter with anti-thundering herd capabilities
class DynamicPacer {
  constructor(options = {}) {
    this.windowSize = options.windowSize || 60000; // 1 minute default
    this.maxRequests = options.maxRequests || 100;
    this.minDelay = options.minDelay || 100; // ms
    this.maxDelay = options.maxDelay || 5000; // ms
    this.backoffFactor = options.backoffFactor || 1.5;
    this.jitterFactor = options.jitterFactor || 0.2;
    
    this.requests = [];
    this.failures = [];
    this.lastReset = performance.now();
    this.state = 'healthy';
    
    // Metrics
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageDelay: 0,
      currentLoad: 0,
      stateChanges: []
    };
  }

  // Record a request (success or failure)
  recordRequest(success = true, timestamp = performance.now()) {
    this.requests.push({ timestamp, success });
    this.metrics.totalRequests++;
    
    if (success) {
      this.metrics.successfulRequests++;
      this.failures = this.failures.filter(f => timestamp - f < this.windowSize);
    } else {
      this.metrics.failedRequests++;
      this.failures.push(timestamp);
    }
    
    this.cleanupOldRequests(timestamp);
    this.updateState();
  }

  // Cleanup old requests outside the window
  cleanupOldRequests(currentTime) {
    const cutoff = currentTime - this.windowSize;
    this.requests = this.requests.filter(req => req.timestamp > cutoff);
  }

  // Calculate current system load
  calculateLoad() {
    const now = performance.now();
    const recentRequests = this.requests.filter(
      req => now - req.timestamp < this.windowSize / 2
    );
    
    return Math.min(1, recentRequests.length / (this.maxRequests / 2));
  }

  // Update system state based on metrics
  updateState() {
    const load = this.calculateLoad();
    const failureRate = this.failures.length / Math.max(1, this.requests.length);
    
    let newState = 'healthy';
    if (failureRate > 0.3) newState = 'degraded';
    if (failureRate > 0.6 || load > 0.9) newState = 'critical';
    
    if (newState !== this.state) {
      this.metrics.stateChanges.push({
        timestamp: performance.now(),
        from: this.state,
        to: newState,
        load: load,
        failureRate: failureRate
      });
      this.state = newState;
    }
    
    this.metrics.currentLoad = load;
  }

  // Calculate dynamic delay based on system state
  calculateDelay() {
    const load = this.calculateLoad();
    const baseDelay = this.minDelay + 
      (this.maxDelay - this.minDelay) * Math.pow(load, 2);
    
    // Add jitter to prevent thundering herd
    const jitter = this.jitterFactor * baseDelay * (Math.random() - 0.5);
    
    // Apply exponential backoff based on recent failures
    const failureBackoff = this.failures.length * 
      Math.min(this.maxDelay, this.minDelay * Math.pow(this.backoffFactor, this.failures.length));
    
    return Math.min(this.maxDelay, baseDelay + jitter + failureBackoff);
  }

  // Execute a request with rate limiting
  async execute(requestFn) {
    const delay = this.calculateDelay();
    
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    try {
      const result = await requestFn();
      this.recordRequest(true);
      return result;
    } catch (error) {
      this.recordRequest(false);
      throw error;
    }
  }

  // Get current metrics
  getMetrics() {
    return {
      ...this.metrics,
      state: this.state,
      activeRequests: this.requests.length,
      recentFailures: this.failures.length,
      currentDelay: this.calculateDelay()
    };
  }

  // Reset the pacer state
  reset() {
    this.requests = [];
    this.failures = [];
    this.lastReset = performance.now();
    this.state = 'healthy';
    
    this.metrics.stateChanges.push({
      timestamp: performance.now(),
      from: this.state,
      to: 'healthy',
      load: 0,
      failureRate: 0
    });
  }
}

// Factory function to create pacer instances
export function createDynamicPacer(options = {}) {
  return new DynamicPacer(options);
}

// Integration with existing artery-pacer.mjs patterns
export class ArteryPacerIntegration {
  constructor(pacer) {
    this.pacer = pacer;
  }

  // Wrap existing artery-pacer methods
  async wrapRequest(requestFn, context = {}) {
    return this.pacer.execute(async () => {
      const start = performance.now();
      try {
        const result = await requestFn();
        const duration = performance.now() - start;
        
        // Log request metrics
        console.debug(' artery-pacer: request completed', {
          context,
          duration,
          state: this.pacer.getMetrics().state
        });
        
        return result;
      } catch (error) {
        const duration = performance.now() - start;
        
        // Log failure metrics
        console.warn(' artery-pacer: request failed', {
          context,
          duration,
          error: error.message,
          state: this.pacer.getMetrics().state
        });
        
        throw error;
      }
    });
  }

  // Get health status for monitoring
  getHealthStatus() {
    const metrics = this.pacer.getMetrics();
    return {
      status: metrics.state,
      load: metrics.currentLoad,
      failures: metrics.recentFailures,
      delay: metrics.currentDelay,
      timestamp: new Date().toISOString()
    };
  }
}

// Export for compatibility with existing imports
export default {
  createDynamicPacer,
  ArteryPacerIntegration
};
