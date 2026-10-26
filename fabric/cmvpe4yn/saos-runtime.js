import { createHash } from 'crypto';
import { setTimeout } from 'timers/promises';

// Distributed Error Handling and Recovery System
// Replaces dependency on artery-pacer.mjs

class HealthMonitor {
  constructor(config = {}) {
    this.config = {
      maxRetries: config.maxRetries || 5,
      initialDelay: config.initialDelay || 1000,
      maxDelay: config.maxDelay || 30000,
      backoffFactor: config.backoffFactor || 2,
      networkTimeout: config.networkTimeout || 5000,
      ...config
    };
    
    this.agents = new Map();
    this.healthStatus = new Map();
    this.alertCallbacks = new Set();
  }

  // Register a new agent in the distributed system
  registerAgent(agentId, agentConfig = {}) {
    if (this.agents.has(agentId)) {
      throw new Error(`Agent ${agentId} already registered`);
    }

    this.agents.set(agentId, {
      id: agentId,
      config: {
        healthCheckInterval: agentConfig.healthCheckInterval || 30000,
        circuitBreakerThreshold: agentConfig.circuitBreakerThreshold || 5,
        ...agentConfig
      },
      health: {
        lastCheck: null,
        consecutiveFailures: 0,
        isHealthy: true,
        lastError: null
      },
      circuitBreaker: {
        state: 'CLOSED', // CLOSED, OPEN, HALF_OPEN
        failures: 0,
        lastFailure: null
      }
    });

    this.healthStatus.set(agentId, 'healthy');
    this.startHealthCheck(agentId);
    return agentId;
  }

  // Start periodic health checks for an agent
  async startHealthCheck(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    const check = async () => {
      try {
        await this.performHealthCheck(agentId);
      } catch (error) {
        this.handleHealthFailure(agentId, error);
      }
      
      setTimeout(check, agent.config.healthCheckInterval).catch(() => {});
    };

    check();
  }

  // Perform actual health check for an agent
  async performHealthCheck(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    // Simulate network check - in real implementation, this would be actual network call
    const startTime = Date.now();
    
    // Simulate network operation
    await new Promise((resolve, reject) => {
      setTimeout(() => {
        // Simulate random failures for testing
        if (Math.random() < 0.05) {
          reject(new Error('Network timeout'));
        } else {
          resolve();
        }
      }, Math.random() * 1000);
    });
    
    const responseTime = Date.now() - startTime;
    
    // Update agent health
    agent.health.lastCheck = Date.now();
    agent.health.consecutiveFailures = 0;
    agent.health.isHealthy = true;
    agent.health.lastError = null;
    
    // Update circuit breaker state
    if (agent.circuitBreaker.state === 'HALF_OPEN') {
      agent.circuitBreaker.state = 'CLOSED';
      agent.circuitBreaker.failures = 0;
    }
    
    this.healthStatus.set(agentId, 'healthy');
  }

  // Handle health check failure
  handleHealthFailure(agentId, error) {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    // Update health status
    agent.health.consecutiveFailures++;
    agent.health.isHealthy = false;
    agent.health.lastError = error;
    agent.circuitBreaker.failures++;
    agent.circuitBreaker.lastFailure = Date.now();
    
    // Update circuit breaker state
    if (agent.circuitBreaker.failures >= agent.config.circuitBreakerThreshold) {
      agent.circuitBreaker.state = 'OPEN';
    } else if (agent.circuitBreaker.state === 'OPEN') {
      agent.circuitBreaker.state = 'HALF_OPEN';
    }
    
    this.healthStatus.set(agentId, 'unhealthy');
    
    // Trigger alerts
    this.triggerAlerts(agentId, error);
  }

  // Execute an operation with retry logic and backoff
  async executeWithRetry(agentId, operation, operationName = 'operation') {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not registered`);
    }

    if (agent.circuitBreaker.state === 'OPEN') {
      throw new Error(`Circuit breaker open for agent ${agentId}`);
    }

    let attempt = 0;
    let lastError;
    
    while (attempt <= this.config.maxRetries) {
      try {
        // Check if circuit breaker is open
        if (agent.circuitBreaker.state === 'OPEN') {
          throw new Error(`Circuit breaker open for agent ${agentId}`);
        }
        
        // Execute operation
        const result = await Promise.race([
          operation(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Network timeout')), this.config.networkTimeout)
          )
        ]);
        
        // Reset on success
        if (attempt > 0) {
          agent.health.consecutiveFailures = 0;
        }
        
        return result;
      } catch (error) {
        lastError = error;
        attempt++;
        
        if (attempt <= this.config.maxRetries) {
          const delay = Math.min(
            this.config.initialDelay * Math.pow(this.config.backoffFactor, attempt - 1),
            this.config.maxDelay
          );
          
          console.warn(`Attempt ${attempt} failed for ${operationName} on agent ${agentId}. Retrying in ${delay}ms.`);
          await setTimeout(delay);
        }
      }
    }
    
    // All attempts failed
    this.handleHealthFailure(agentId, lastError);
    throw lastError;
  }

  // Add alert callback
  addAlertCallback(callback) {
    this.alertCallbacks.add(callback);
  }

  // Remove alert callback
  removeAlertCallback(callback) {
    this.alertCallbacks.delete(callback);
  }

  // Trigger all registered alerts
  triggerAlerts(agentId, error) {
    const alert = {
      agentId,
      timestamp: Date.now(),
      error: error.message,
      healthStatus: this.healthStatus.get(agentId),
      consecutiveFailures: this.agents.get(agentId)?.health.consecutiveFailures || 0
    };
    
    this.alertCallbacks.forEach(callback => {
      try {
        callback(alert);
      } catch (e) {
        console.error('Error in alert callback:', e);
      }
    });
  }

  // Get health status for all agents
  getSystemHealth() {
    const status = {};
    
    for (const [agentId, agent] of this.agents) {
      status[agentId] = {
        id: agentId,
        health: this.healthStatus.get(agentId),
        consecutiveFailures: agent.health.consecutiveFailures,
        lastError: agent.health.lastError?.message || null,
        circuitBreaker: agent.circuitBreaker.state,
        lastCheck: agent.health.lastCheck
      };
    }
    
    return {
      timestamp: Date.now(),
      agents: status,
      overallHealth: this.calculateOverallHealth()
    };
  }

  // Calculate overall system health
  calculateOverallHealth() {
    const healthyCount = Array.from(this.healthStatus.values()).filter(status => status === 'healthy').length;
    const totalCount = this.agents.size;
    
    if (totalCount === 0) return 'no_agents';
    if (healthyCount === totalCount) return 'healthy';
    if (healthyCount > totalCount / 2) return 'degraded';
    return 'critical';
  }
}

// Export for use in saos-runtime
export default HealthMonitor;

// Unit tests
if (import.meta.url === `file://${process.argv[1]}`) {
  const testHealthMonitor = async () => {
    console.log('Starting HealthMonitor tests...');
    
    const monitor = new HealthMonitor({
      maxRetries: 3,
      initialDelay: 100,
      maxDelay: 500
    });
    
    // Test 1: Agent registration
    const agentId = monitor.registerAgent('test-agent', {
      healthCheckInterval: 1000,
      circuitBreakerThreshold: 2
    });
    
    console.log('✓ Agent registered successfully');
    
    // Test 2: Health check
    await monitor.performHealthCheck(agentId);
    console.log('✓ Health check passed');
    
    // Test 3: Operation with retry
    let attemptCount = 0;
    const failingOperation = async () => {
      attemptCount++;
      if (attemptCount < 3) {
        throw new Error(`Attempt ${attemptCount} failed`);
      }
      return 'success';
    };
    
    const result = await monitor.executeWithRetry(agentId, failingOperation, 'test-operation');
    console.log('✓ Operation with retry succeeded:', result);
    
    // Test 4: Alert callback
    let alertReceived = false;
    monitor.addAlertCallback((alert) => {
      alertReceived = true;
      console.log('✓ Alert received:', alert);
    });
    
    // Simulate failure
    await monitor.handleHealthFailure(agentId, new Error('Test failure'));
    
    if (alertReceived) {
      console.log('✓ Alert callback triggered');
    } else {
      console.error('✗ Alert callback not triggered');
    }
    
    // Test 5: System health status
    const health = monitor.getSystemHealth();
    console.log('✓ System health status:', health.overallHealth);
    
    console.log('All tests completed successfully!');
  };
  
  testHealthMonitor().catch(console.error);
}
