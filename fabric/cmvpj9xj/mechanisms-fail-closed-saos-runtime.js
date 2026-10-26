import { createHash } from 'crypto';
import { setTimeout } from 'timers/promises';

// Configuration
const CONFIG = {
  MAX_RETRIES: 5,
  INITIAL_BACKOFF_MS: 1000,
  BACKOFF_FACTOR: 2,
  FAILURE_THRESHOLD: 3,
  HEALTH_CHECK_INTERVAL_MS: 30000,
  MONITOR_LOG_INTERVAL_MS: 60000
};

// Circuit breaker state
const CIRCUIT_BREAKER = {
  state: 'CLOSED', // CLOSED, OPEN, HALF_OPEN
  failures: 0,
  lastFailureTime: null,
  nextRetryTime: null,
  backupMechanisms: []
};

// Mechanism registry
const MECHANISMS = new Map();

// Backup mechanism registry
const BACKUP_MECHANISMS = new Map();

// Health monitor
class HealthMonitor {
  constructor() {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      circuitBreakerChanges: 0
    };
    this.alerts = [];
  }

  recordRequest(success) {
    this.metrics.totalRequests++;
    if (success) {
      this.metrics.successfulRequests++;
    } else {
      this.metrics.failedRequests++;
    }
  }

  recordCircuitBreakerChange(oldState, newState) {
    this.metrics.circuitBreakerChanges++;
    this.alerts.push({
      timestamp: new Date().toISOString(),
      type: 'CIRCUIT_BREAKER_STATE_CHANGE',
      details: `State changed from ${oldState} to ${newState}`
    });
  }

  getHealthReport() {
    const successRate = this.metrics.totalRequests > 0 
      ? (this.metrics.successfulRequests / this.metrics.totalRequests) * 100 
      : 100;
    
    return {
      ...this.metrics,
      successRate,
      alerts: this.alerts.slice(-10), // Last 10 alerts
      circuitBreakerState: CIRCUIT_BREAKER.state,
      failures: CIRCUIT_BREAKER.failures,
      nextRetryTime: CIRCUIT_BREAKER.nextRetryTime
    };
  }

  logMetrics() {
    const report = this.getHealthReport();
    console.log(`[Health Monitor] ${new Date().toISOString()}:`, report);
    
    // Log alerts
    report.alerts.forEach(alert => {
      console.warn(`[ALERT] ${alert.timestamp}: ${alert.type} - ${alert.details}`);
    });
  }
}

const healthMonitor = new HealthMonitor();

// Circuit breaker logic
function updateCircuitBreaker(success) {
  const oldState = CIRCUIT_BREAKER.state;
  
  if (success) {
    CIRCUIT_BREAKER.failures = 0;
    if (CIRCUIT_BREAKER.state === 'HALF_OPEN') {
      CIRCUIT_BREAKER.state = 'CLOSED';
      healthMonitor.recordCircuitBreakerChange('HALF_OPEN', 'CLOSED');
    }
  } else {
    CIRCUIT_BREAKER.failures++;
    CIRCUIT_BREAKER.lastFailureTime = Date.now();
    
    if (CIRCUIT_BREAKER.state === 'CLOSED' && 
        CIRCUIT_BREAKER.failures >= CONFIG.FAILURE_THRESHOLD) {
      CIRCUIT_BREAKER.state = 'OPEN';
      calculateNextRetryTime();
      healthMonitor.recordCircuitBreakerChange('CLOSED', 'OPEN');
    }
  }
  
  healthMonitor.recordRequest(success);
}

function calculateNextRetryTime() {
  const backoffTime = CONFIG.INITIAL_BACKOFF_MS * 
    Math.pow(CONFIG.BACKOFF_FACTOR, CIRCUIT_BREAKER.failures - CONFIG.FAILURE_THRESHOLD);
  
  CIRCUIT_BREAKER.nextRetryTime = Date.now() + backoffTime;
}

function shouldAllowRequest() {
  if (CIRCUIT_BREAKER.state === 'CLOSED') {
    return true;
  }
  
  if (CIRCUIT_BREAKER.state === 'OPEN') {
    if (Date.now() >= CIRCUIT_BREAKER.nextRetryTime) {
      CIRCUIT_BREAKER.state = 'HALF_OPEN';
      healthMonitor.recordCircuitBreakerChange('OPEN', 'HALF_OPEN');
      return true;
    }
    return false;
  }
  
  // HALF_OPEN state - allow one request to test
  return true;
}

// Mechanism registration
function registerMechanism(name, fn, isBackup = false) {
  const registry = isBackup ? BACKUP_MECHANISMS : MECHANISMS;
  
  if (registry.has(name)) {
    throw new Error(`Mechanism ${name} is already registered`);
  }
  
  registry.set(name, {
    fn,
    isBackup,
    callCount: 0,
    failureCount: 0,
    lastFailure: null
  });
  
  if (!isBackup) {
    CIRCUIT_BREAKER.backupMechanisms.push(name);
  }
}

// Execute mechanism with fail-closed logic
async function executeMechanism(name, ...args) {
  if (!MECHANISMS.has(name) && !BACKUP_MECHANISMS.has(name)) {
    throw new Error(`Mechanism ${name} not found`);
  }
  
  const mechanism = MECHANISMS.get(name) || BACKUP_MECHANISMS.get(name);
  const isBackup = BACKUP_MECHANISMS.has(name);
  
  mechanism.callCount++;
  
  // Check if we should allow the request
  if (!isBackup && !shouldAllowRequest()) {
    // Try backup mechanism
    const backupName = `${name}-backup`;
    if (BACKUP_MECHANISMS.has(backupName)) {
      console.log(`[Circuit Breaker] Using backup mechanism: ${backupName}`);
      return executeMechanism(backupName, ...args);
    }
    
    throw new Error(`Circuit breaker is OPEN for mechanism ${name}`);
  }
  
  try {
    const result = await mechanism.fn(...args);
    
    if (!isBackup) {
      updateCircuitBreaker(true);
    }
    
    return result;
  } catch (error) {
    mechanism.failureCount++;
    mechanism.lastFailure = new Date().toISOString();
    
    if (!isBackup) {
      updateCircuitBreaker(false);
    }
    
    // Try backup mechanism if available
    if (!isBackup) {
      const backupName = `${name}-backup`;
      if (BACKUP_MECHANISMS.has(backupName)) {
        console.warn(`[Backup] Primary mechanism ${name} failed, trying backup: ${backupName}`);
        return executeMechanism(backupName, ...args);
      }
    }
    
    throw error;
  }
}

// Exponential backoff with jitter
async function backoff(attempt) {
  const baseDelay = CONFIG.INITIAL_BACKOFF_MS * Math.pow(CONFIG.BACKOFF_FACTOR, attempt - 1);
  const jitter = Math.random() * 0.2 * baseDelay; // 20% jitter
  const delay = baseDelay + jitter;
  
  await setTimeout(delay);
}

// Retry mechanism with backoff
async function executeWithRetry(name, ...args) {
  let lastError;
  
  for (let attempt = 1; attempt <= CONFIG.MAX_RETRIES; attempt++) {
    try {
      return await executeMechanism(name, ...args);
    } catch (error) {
      lastError = error;
      
      if (attempt < CONFIG.MAX_RETRIES) {
        console.warn(`[Retry] Attempt ${attempt} failed for ${name}, retrying...`);
        await backoff(attempt);
      }
    }
  }
  
  throw lastError;
}

// Monitoring and alerting
function startMonitoring() {
  setInterval(() => {
    healthMonitor.logMetrics();
  }, CONFIG.MONITOR_LOG_INTERVAL_MS);
}

// Health check function
async function healthCheck() {
  try {
    // Example health check - can be customized
    const checkResult = await executeMechanism('healthCheck');
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      circuitBreakerState: CIRCUIT_BREAKER.state,
      mechanisms: Array.from(MECHANISMS.keys()).map(name => ({
        name,
        callCount: MECHANISMS.get(name).callCount,
        failureCount: MECHANISMS.get(name).failureCount,
        lastFailure: MECHANISMS.get(name).lastFailure
      }))
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message,
      circuitBreakerState: CIRCUIT_BREAKER.state
    };
  }
}

// Initialize monitoring
startMonitoring();

// Export the module
export {
  registerMechanism,
  executeMechanism,
  executeWithRetry,
  healthCheck,
  healthMonitor,
  CIRCUIT_BREAKER
};

// Example usage (for testing purposes)
if (import.meta.url === `file://${process.argv[1]}`) {
  // Register example mechanisms
  registerMechanism('example', async (data) => {
    console.log(`Executing example mechanism with data: ${data}`);
    if (data === 'fail') {
      throw new Error('Example mechanism failed');
    }
    return `Success: ${data}`;
  });
  
  registerMechanism('example-backup', async (data) => {
    console.log(`Executing backup example mechanism with data: ${data}`);
    return `Backup Success: ${data}`;
  }, true);
  
  registerMechanism('healthCheck', async () => {
    return 'OK';
  });
  
  // Test the system
  (async () => {
    console.log('Testing fail-closed preserved system...');
    
    // Test successful execution
    try {
      const result1 = await executeMechanism('example', 'test');
      console.log('Result 1:', result1);
    } catch (error) {
      console.error('Error 1:', error.message);
    }
    
    // Test failure triggering backup
    try {
      const result2 = await executeMechanism('example', 'fail');
      console.log('Result 2:', result2);
    } catch (error) {
      console.error('Error 2:', error.message);
    }
    
    // Test retry mechanism
    try {
      const result3 = await executeWithRetry('example', 'fail');
      console.log('Result 3:', result3);
    } catch (error) {
      console.error('Error 3:', error.message);
    }
    
    // Get health report
    const report = healthMonitor.getHealthReport();
    console.log('Health Report:', report);
  })();
}