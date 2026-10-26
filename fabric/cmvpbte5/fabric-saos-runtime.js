import { createHash } from 'crypto';
import { performance } from 'perf_hooks';

/**
 * Alternative rate control mechanism for saos-runtime fabric/
 * Replaces missing artery-pacer.mjs with modular rate limiting
 */
class FabricRateController {
  /**
   * @param {Object} config - Configuration object
   * @param {number} config.maxRequests - Maximum requests per window
   * @param {number} config.windowMs - Time window in milliseconds
   * @param {number} config.safetyThreshold - Safety threshold (0-1) for fail-closed
   * @param {number} config.coolDownMs - Cooldown period after fail-closed activation
   */
  constructor(config = {
    maxRequests: 100,
    windowMs: 60000,
    safetyThreshold: 0.8,
    coolDownMs: 300000
  }) {
    this.config = {
      maxRequests: config.maxRequests || 100,
      windowMs: config.windowMs || 60000,
      safetyThreshold: config.safetyThreshold || 0.8,
      coolDownMs: config.coolDownMs || 300000
    };
    
    this.requests = new Map();
    this.systemLoad = 0;
    this.failClosed = false;
    this.failClosedUntil = 0;
    this.eventLog = [];
    
    // Agent isolation
    this.agentId = this.generateAgentId();
    this.otherAgents = new Set();
  }
  
  /**
   * Generate unique agent ID
   * @returns {string}
   */
  generateAgentId() {
    return `agent-${createHash('sha256')
      .update(performance.now().toString())
      .digest('hex')
      .slice(0, 8)}`;
  }
  
  /**
   * Record system load (0-1 scale)
   * @param {number} load - System load metric
   */
  recordSystemLoad(load) {
    this.systemLoad = Math.max(0, Math.min(1, load));
    this.logEvent('SYSTEM_LOAD', { load: this.systemLoad });
    
    // Check for fail-closed conditions
    if (this.systemLoad > this.config.safetyThreshold && !this.failClosed) {
      this.activateFailClosed();
    }
  }
  
  /**
   * Activate fail-closed mode
   */
  activateFailClosed() {
    this.failClosed = true;
    this.failClosedUntil = performance.now() + this.config.coolDownMs;
    this.logEvent('FAIL_CLOSED_ACTIVATED', {
      load: this.systemLoad,
      threshold: this.config.safetyThreshold,
      until: new Date(this.failClosedUntil).toISOString()
    });
  }
  
  /**
   * Check if fail-closed mode should be deactivated
   */
  checkFailClosedStatus() {
    if (this.failClosed && performance.now() > this.failClosedUntil) {
      this.failClosed = false;
      this.logEvent('FAIL_CLOSED_DEACTIVATED', {
        load: this.systemLoad,
        cooldown: this.config.coolDownMs
      });
    }
  }
  
  /**
   * Check if request is allowed
   * @param {string} agentId - Requesting agent ID
   * @returns {boolean} - True if request is allowed
   */
  request(agentId) {
    this.checkFailClosedStatus();
    
    // Track other agents for isolation
    if (agentId !== this.agentId) {
      this.otherAgents.add(agentId);
    }
    
    // Fail-closed takes precedence
    if (this.failClosed) {
      this.logEvent('REQUEST_DENIED_FAIL_CLOSED', {
        agentId,
        load: this.systemLoad
      });
      return false;
    }
    
    // Get current window
    const now = performance.now();
    const windowStart = now - this.config.windowMs;
    
    // Clean old requests
    for (const [timestamp] of this.requests) {
      if (timestamp < windowStart) {
        this.requests.delete(timestamp);
      }
    }
    
    // Check if request would exceed limit
    if (this.requests.size >= this.config.maxRequests) {
      this.logEvent('REQUEST_DENIED_RATE_LIMIT', {
        agentId,
        current: this.requests.size,
        max: this.config.maxRequests
      });
      return false;
    }
    
    // Record request
    this.requests.set(now, agentId);
    this.logEvent('REQUEST_ALLOWED', {
      agentId,
      current: this.requests.size,
      max: this.config.maxRequests,
      load: this.systemLoad
    });
    
    return true;
  }
  
  /**
   * Get current rate limit status
   * @returns {Object}
   */
  getStatus() {
    return {
      agentId: this.agentId,
      currentRequests: this.requests.size,
      maxRequests: this.config.maxRequests,
      systemLoad: this.systemLoad,
      failClosed: this.failClosed,
      failClosedUntil: this.failClosedUntil ? new Date(this.failClosedUntil).toISOString() : null,
      otherAgents: Array.from(this.otherAgents),
      windowMs: this.config.windowMs
    };
  }
  
  /**
   * Log event with metadata
   * @param {string} type - Event type
   * @param {Object} data - Event data
   */
  logEvent(type, data) {
    const event = {
      timestamp: performance.now(),
      isoTimestamp: new Date().toISOString(),
      type,
      agentId: this.agentId,
      data
    };
    
    this.eventLog.push(event);
    
    // Keep only last 1000 events
    if (this.eventLog.length > 1000) {
      this.eventLog = this.eventLog.slice(-1000);
    }
  }
  
  /**
   * Get event log
   * @param {number} limit - Maximum number of events to return
   * @returns {Array}
   */
  getEventLog(limit = 100) {
    return this.eventLog.slice(-limit);
  }
  
  /**
   * Reset rate limiter
   */
  reset() {
    this.requests.clear();
    this.systemLoad = 0;
    this.failClosed = false;
    this.failClosedUntil = 0;
    this.logEvent('RESET', {});
  }
}

export default FabricRateController;
