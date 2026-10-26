import { createHash } from 'crypto';
import { setTimeout } from 'timers/promises';

// Circuit breaker states
const CIRCUIT_STATES = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN'
};

// Error detection and recovery system
class ErrorDetectionSystem {
  constructor() {
    this.errorCounts = new Map();
    this.lastErrorTime = new Map();
    this.errorThreshold = 5; // Max errors before triggering circuit breaker
    this.errorWindowMs = 60000; // 1 minute error window
  }

  recordError(agentId, errorType) {
    const now = Date.now();
    const key = `${agentId}:${errorType}`;
    
    // Clean old errors outside the window
    if (this.lastErrorTime.has(key) && now - this.lastErrorTime.get(key) > this.errorWindowMs) {
      this.errorCounts.delete(key);
    }
    
    // Increment error count
    const count = (this.errorCounts.get(key) || 0) + 1;
    this.errorCounts.set(key, count);
    this.lastErrorTime.set(key, now);
    
    return count;
  }

  shouldBreakCircuit(agentId) {
    for (const [key, count] of this.errorCounts) {
      if (key.startsWith(`${agentId}:`) && count >= this.errorThreshold) {
        return true;
      }
    }
    return false;
  }

  resetErrors(agentId) {
    for (const key of this.errorCounts.keys()) {
      if (key.startsWith(`${agentId}:`)) {
        this.errorCounts.delete(key);
        this.lastErrorTime.delete(key);
      }
    }
  }
}

// Distributed rate limiter with adaptive backoff
class DistributedRateLimiter {
  constructor() {
    this.agentLoad = new Map();
    this.globalLoad = 0;
    this.maxGlobalLoad = 100; // Arbitrary units
    this.adaptiveFactor = 1.0;
    this.minDelay = 100; // ms
    this.maxDelay = 5000; // ms
  }

  recordAgentLoad(agentId, load) {
    this.agentLoad.set(agentId, load);
    this.updateGlobalLoad();
  }

  updateGlobalLoad() {
    this.globalLoad = Array.from(this.agentLoad.values()).reduce((sum, load) => sum + load, 0);
    
    // Adjust adaptive factor based on global load
    if (this.globalLoad > this.maxGlobalLoad * 0.8) {
      this.adaptiveFactor = Math.min(2.0, this.adaptiveFactor * 1.1);
    } else if (this.globalLoad < this.maxGlobalLoad * 0.5) {
      this.adaptiveFactor = Math.max(0.5, this.adaptiveFactor * 0.9);
    }
  }

  getDelay(agentId) {
    const agentLoad = this.agentLoad.get(agentId) || 0;
    const loadRatio = agentLoad / 10; // Normalize load
    
    // Calculate base delay with adaptive factor
    let delay = this.minDelay + (this.maxDelay - this.minDelay) * loadRatio * this.adaptiveFactor;
    
    // Add jitter to avoid synchronization
    delay = delay * (0.9 + Math.random() * 0.2);
    
    return Math.min(this.maxDelay, Math.max(this.minDelay, delay));
  }
}

// Circuit breaker with self-healing
class CircuitBreaker {
  constructor(agentId, errorDetection, rateLimiter) {
    this.agentId = agentId;
    this.state = CIRCUIT_STATES.CLOSED;
    this.errorDetection = errorDetection;
    this.rateLimiter = rateLimiter;
    this.failureCount = 0;
    this.lastFailureTime = 0;
    this.timeout = 60000; // 1 minute timeout
    this.halfOpenSuccessCount = 0;
    this.halfOpenThreshold = 3; // Successes needed to close circuit again
  }

  async execute(operation, fallback) {
    // Check if circuit should be open
    if (this.state === CIRCUIT_STATES.OPEN) {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = CIRCUIT_STATES.HALF_OPEN;
        this.halfOpenSuccessCount = 0;
      } else {
        return fallback();
      }
    }

    // Apply rate limiting
    const delay = this.rateLimiter.getDelay(this.agentId);
    if (delay > this.minDelay) {
      await setTimeout(delay);
    }

    try {
      const result = await operation();
      
      // Reset on success
      if (this.state === CIRCUIT_STATES.HALF_OPEN) {
        this.halfOpenSuccessCount++;
        if (this.halfOpenSuccessCount >= this.halfOpenThreshold) {
          this.state = CIRCUIT_STATES.CLOSED;
          this.errorDetection.resetErrors(this.agentId);
        }
      }
      
      this.failureCount = 0;
      return result;
    } catch (error) {
      this.handleFailure(error);
      return fallback(error);
    }
  }

  handleFailure(error) {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    // Record error for detection system
    const errorType = error.constructor.name;
    this.errorDetection.recordError(this.agentId, errorType);
    
    // Check if we should open circuit
    if (this.errorDetection.shouldBreakCircuit(this.agentId)) {
      this.state = CIRCUIT_STATES.OPEN;
    }
  }
}

// Self-healing mechanism
class SelfHealingMechanism {
  constructor(agentId, circuitBreaker) {
    this.agentId = agentId;
    this.circuitBreaker = circuitBreaker;
    this.healthCheckInterval = 30000; // 30 seconds
    this.isRunning = false;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    
    // Start periodic health checks
    setInterval(() => this.performHealthCheck(), this.healthCheckInterval);
  }

  async performHealthCheck() {
    try {
      // Simulate health check operation
      const healthCheck = () => {
        // In a real implementation, this would check actual system health
        return { status: 'healthy', timestamp: Date.now() };
      };
      
      const result = await this.circuitBreaker.execute(
        healthCheck,
        () => ({ status: 'degraded', timestamp: Date.now() })
      );
      
      // If circuit is open and health check passes, try to transition to half-open
      if (this.circuitBreaker.state === CIRCUIT_STATES.OPEN && result.status === 'healthy') {
        this.circuitBreaker.state = CIRCUIT_STATES.HALF_OPEN;
      }
    } catch (error) {
      console.error(`Health check failed for agent ${this.agentId}:`, error);
    }
  }
}

// Main distributed error handling system
class DistributedErrorHandlingSystem {
  constructor() {
    this.errorDetection = new ErrorDetectionSystem();
    this.rateLimiter = new DistributedRateLimiter();
    this.agents = new Map();
  }

  registerAgent(agentId) {
    const circuitBreaker = new CircuitBreaker(
      agentId,
      this.errorDetection,
      this.rateLimiter
    );
    
    const selfHealing = new SelfHealingMechanism(agentId, circuitBreaker);
    selfHealing.start();
    
    this.agents.set(agentId, {
      circuitBreaker,
      selfHealing
    });
    
    return circuitBreaker;
  }

  recordAgentLoad(agentId, load) {
    this.rateLimiter.recordAgentLoad(agentId, load);
  }

  getGlobalLoad() {
    return this.rateLimiter.globalLoad;
  }
}

// Example usage
const system = new DistributedErrorHandlingSystem();
const agentId = 'agent-9';
const circuitBreaker = system.registerAgent(agentId);

// Simulate agent operations
async function simulateAgentOperation() {
  // Record some load
  system.recordAgentLoad(agentId, Math.floor(Math.random() * 10));
  
  // Define an operation that might fail
  const operation = async () => {
    // Simulate random failures
    if (Math.random() < 0.2) {
      throw new Error('Simulated operation failure');
    }
    
    // Simulate work
    await setTimeout(100);
    return { success: true, data: 'Operation completed' };
  };
  
  // Define fallback
  const fallback = (error) => {
    console.log(`Operation failed for ${agentId}:`, error.message);
    return { success: false, error: error.message, fallback: true };
  };
  
  // Execute with circuit breaker protection
  const result = await circuitBreaker.execute(operation, fallback);
  console.log(`Result for ${agentId}:`, result);
  
  return result;
}

// Run simulation
async function runSimulation() {
  console.log(`Starting simulation for ${agentId}`);
  console.log('Global load:', system.getGlobalLoad());
  
  for (let i = 0; i < 20; i++) {
    await simulateAgentOperation();
    await setTimeout(500); // Simulate time between operations
  }
  
  console.log('Simulation completed');
}

// Export for use in other modules
export {
  DistributedErrorHandlingSystem,
  ErrorDetectionSystem,
  DistributedRateLimiter,
  CircuitBreaker,
  SelfHealingMechanism,
  CIRCUIT_STATES
};

// For standalone execution
if (import.meta.url === `file://${process.argv[1]}`) {
  runSimulation().catch(console.error);
}
