import { createHash } from 'crypto';
import { setTimeout } from 'timers/promises';

/**
 * Enhanced Error Handling and Rate Control System for SAOS Runtime
 * Replaces artery-pacer.mjs with distributed agent support and metrics
 */
class ErrorRateControlSystem {
  constructor(config = {}) {
    this.config = {
      maxRetries: config.maxRetries || 4,
      baseBackoffMs: config.baseBackoffMs || 1000,
      maxBackoffMs: config.maxBackoffMs || 30000,
      backoffWindow: config.backoffWindow || 5,
      metricsRetention: config.metricsRetention || 3600000, // 1 hour
      ...config
    };
    
    this.agents = new Map();
    this.metrics = {
      failures: 0,
      successes: 0,
      retries: 0,
      lastFailure: null,
      recoveryWindow: []
    };
    
    this.initializeSystem();
  }

  /**
   * Initialize the system and load existing agent configurations
   */
  initializeSystem() {
    // Load existing agents from state if available
    try {
      const agentState = require('./state/agent-state.json');
      if (agentState && agentState.agents) {
        for (const [id, config] of Object.entries(agentState.agents)) {
          this.registerAgent(id, config);
        }
      }
    } catch (e) {
      console.warn('No existing agent state found, starting fresh');
    }
  }

  /**
   * Register a new agent with the system
   */
  registerAgent(agentId, config = {}) {
    const agentConfig = {
      id: agentId,
      retryCount: 0,
      lastAttempt: null,
      successCount: 0,
      failureCount: 0,
      backoffSchedule: [],
      ...config
    };
    
    this.agents.set(agentId, agentConfig);
    this.logToAgentLog(agentId, `Agent registered with config: ${JSON.stringify(config)}`);
    return agentConfig;
  }

  /**
   * Execute an operation with error handling and rate control
   */
  async execute(agentId, operation, ...args) {
    const agent = this.agents.get(agentId) || this.registerAgent(agentId);
    
    try {
      const result = await this.attemptOperation(agent, operation, ...args);
      this.recordSuccess(agentId);
      return result;
    } catch (error) {
      return await this.handleFailure(agentId, operation, error, ...args);
    }
  }

  /**
   * Attempt an operation with retry logic
   */
  async attemptOperation(agent, operation, ...args) {
    const attempt = agent.retryCount + 1;
    
    if (attempt > 1) {
      const backoffTime = this.calculateBackoff(agent);
      await setTimeout(backoffTime);
      agent.backoffSchedule.push(backoffTime);
    }
    
    try {
      agent.lastAttempt = Date.now();
      const result = await operation(...args);
      agent.retryCount = 0; // Reset on success
      return result;
    } catch (error) {
      agent.retryCount++;
      this.metrics.retries++;
      throw error;
    }
  }

  /**
   * Handle operation failure with retry logic
   */
  async handleFailure(agentId, operation, error, ...args) {
    const agent = this.agents.get(agentId);
    agent.failureCount++;
    this.metrics.failures++;
    this.metrics.lastFailure = {
      timestamp: Date.now(),
      error: error.message,
      agentId
    };
    
    this.logToAgentLog(agentId, `Failure #${agent.failureCount}: ${error.message}`);
    
    if (agent.retryCount < this.config.maxRetries) {
      this.logToAgentLog(agentId, `Retrying (${agent.retryCount + 1}/${this.config.maxRetries})`);
      return this.attemptOperation(agent, operation, ...args);
    } else {
      this.logToAgentLog(agentId, `Max retries exceeded. Failing permanently.`);
      throw new Error(`Operation failed after ${this.config.maxRetries} retries: ${error.message}`);
    }
  }

  /**
   * Calculate backoff time using quadratic backoff
   */
  calculateBackoff(agent) {
    const quadratic = Math.pow(agent.retryCount, 2);
    const backoff = Math.min(
      this.config.baseBackoffMs * quadratic,
      this.config.maxBackoffMs
    );
    
    // Add jitter to avoid thundering herd
    const jitter = Math.random() * 0.2 * backoff;
    return Math.floor(backoff + jitter);
  }

  /**
   * Record successful operation
   */
  recordSuccess(agentId) {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.successCount++;
      agent.failureCount = 0; // Reset failure count on success
      agent.retryCount = 0; // Reset retry count
    }
    
    this.metrics.successes++;
    this.metrics.recoveryWindow.push(Date.now());
    this.pruneRecoveryWindow();
  }

  /**
   * Prune old recovery window entries
   */
  pruneRecoveryWindow() {
    const cutoff = Date.now() - this.config.backoffWindow * 1000;
    this.metrics.recoveryWindow = this.metrics.recoveryWindow.filter(
      timestamp => timestamp > cutoff
    );
  }

  /**
   * Get system health status
   */
  getHealthStatus() {
    const recentFailures = this.metrics.recoveryWindow.length;
    const isHealthy = recentFailures < this.config.backoffWindow;
    
    return {
      status: isHealthy ? 'HEALTHY' : 'DEGRADED',
      recentFailures,
      backoffWindow: this.config.backoffWindow,
      metrics: {
        ...this.metrics,
        agentsCount: this.agents.size
      }
    };
  }

  /**
   * Log to agent-specific log
   */
  logToAgentLog(agentId, message) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}`;
    
    // In a real implementation, this would write to a proper log file
    console.log(`[AGENT-${agentId}] ${logEntry}`);
    
    // Store in metrics for later analysis
    if (!this.metrics.logs) this.metrics.logs = [];
    this.metrics.logs.push({
      timestamp,
      agentId,
      message
    });
    
    // Prune old logs
    if (this.metrics.logs.length > 1000) {
      this.metrics.logs = this.metrics.logs.slice(-1000);
    }
  }

  /**
   * Export current state for persistence
   */
  exportState() {
    return {
      agents: Object.fromEntries(this.agents),
      metrics: this.metrics,
      config: this.config,
      exportedAt: new Date().toISOString()
    };
  }

  /**
   * Import state from persisted data
   */
  importState(state) {
    if (state.agents) {
      this.agents = new Map(Object.entries(state.agents));
    }
    if (state.metrics) {
      this.metrics = { ...this.metrics, ...state.metrics };
    }
    if (state.config) {
      this.config = { ...this.config, ...state.config };
    }
  }
}

/**
 * Factory function to create instances for different contexts
 */
function createErrorRateControl(config = {}) {
  return new ErrorRateControlSystem(config);
}

export { ErrorRateControlSystem, createErrorRateControl };

// Example usage for replacing artery-pacer.mjs references
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ErrorRateControlSystem, createErrorRateControl };
}
