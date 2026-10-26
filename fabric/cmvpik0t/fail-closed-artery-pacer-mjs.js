// agent-9-insurance/src/artery-pacer-embedded.mjs

import { createHash } from 'crypto';

// Embedded fail-closed pacer for agent-9-insurance and dependent agents
// Reimplements critical artery-pacer functions with fail-closed strategy

// Configuration constants
const PACER_CONFIG = {
  // Circuit breaker thresholds
  FAILURE_THRESHOLD: 5,
  RECOVERY_THRESHOLD: 3,
  TIMEOUT_MS: 30000,
  
  // Fail-closed strategy
  CLOSED_STATE_TIMEOUT: 60000, // 1 minute in closed state
  
  // Monitoring
  MONITOR_INTERVAL: 5000,
  MAX_LOG_ENTRIES: 100
};

// State management
let pacerState = {
  isClosed: false,
  failureCount: 0,
  successCount: 0,
  lastFailureTime: null,
  lastSuccessTime: null,
  lastStateChange: null,
  log: []
};

// Circuit breaker implementation
export class ArteryPacer {
  constructor(options = {}) {
    this.config = { ...PACER_CONFIG, ...options };
    this.monitorInterval = null;
    this.startMonitoring();
  }

  // Execute with fail-closed protection
  async execute(fn, context = {}) {
    if (this.isCircuitClosed()) {
      this.logFailure('CIRCUIT_CLOSED', 'Operation blocked due to circuit being closed');
      throw new Error('Circuit is closed - fail-closed activated');
    }

    const startTime = Date.now();
    
    try {
      const result = await Promise.race([
        fn(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Operation timeout')), this.config.TIMEOUT_MS)
        )
      ]);
      
      this.logSuccess('SUCCESS', `Operation completed in ${Date.now() - startTime}ms`, context);
      return result;
    } catch (error) {
      this.logFailure('OPERATION_FAILED', error.message, context);
      throw error;
    }
  }

  // Check if circuit should be closed
  isCircuitClosed() {
    if (this.config.FAILURE_THRESHOLD > 0 && 
        pacerState.failureCount >= this.config.FAILURE_THRESHOLD) {
      
      // Check if enough time has passed since last failure
      if (this.config.CLOSED_STATE_TIMEOUT > 0 && 
          pacerState.lastFailureTime &&
          Date.now() - pacerState.lastFailureTime < this.config.CLOSED_STATE_TIMEOUT) {
        return true;
      }
      
      // Check for recovery threshold
      if (pacerState.successCount >= this.config.RECOVERY_THRESHOLD) {
        this.openCircuit();
        return false;
      }
      
      return true;
    }
    return false;
  }

  // Transition to closed state
  closeCircuit(reason = 'Threshold exceeded') {
    if (!pacerState.isClosed) {
      pacerState.isClosed = true;
      pacerState.lastStateChange = Date.now();
      this.logFailure('CIRCUIT_CLOSED', reason);
      
      // Emit event for monitoring systems
      this.emitStateChange('closed', reason);
    }
  }

  // Transition to open state
  openCircuit() {
    if (pacerState.isClosed) {
      pacerState.isClosed = false;
      pacerState.failureCount = 0;
      pacerState.successCount = 0;
      pacerState.lastStateChange = Date.now();
      this.logSuccess('CIRCUIT_OPENED', 'Circuit recovered after meeting success threshold');
      
      // Emit event for monitoring systems
      this.emitStateChange('open', 'Recovery threshold met');
    }
  }

  // Log successful operation
  logSuccess(type, message, context = {}) {
    const entry = {
      timestamp: Date.now(),
      type,
      message,
      context,
      state: this.getCurrentState()
    };
    
    pacerState.successCount++;
    pacerState.lastSuccessTime = Date.now();
    
    this.addToLog(entry);
  }

  // Log failure
  logFailure(type, message, context = {}) {
    const entry = {
      timestamp: Date.now(),
      type,
      message,
      context,
      state: this.getCurrentState()
    };
    
    pacerState.failureCount++;
    pacerState.lastFailureTime = Date.now();
    
    // Check if we need to close the circuit
    if (pacerState.failureCount >= this.config.FAILURE_THRESHOLD) {
      this.closeCircuit(`Failure threshold reached: ${pacerState.failureCount}/${this.config.FAILURE_THRESHOLD}`);
    }
    
    this.addToLog(entry);
  }\n
  // Add entry to circular log
  addToLog(entry) {
    pacerState.log.push(entry);
    if (pacerState.log.length > this.config.MAX_LOG_ENTRIES) {
      pacerState.log.shift();
    }
  }

  // Get current state
  getCurrentState() {
    return {
      isClosed: pacerState.isClosed,
      failureCount: pacerState.failureCount,
      successCount: pacerState.successCount,
      lastFailureTime: pacerState.lastFailureTime,
      lastSuccessTime: pacerState.lastSuccessTime,
      lastStateChange: pacerState.lastStateChange
    };
  }

  // Start monitoring
  startMonitoring() {
    if (this.monitorInterval) return;
    
    this.monitorInterval = setInterval(() => {
      this.checkHealth();
    }, this.config.MONITOR_INTERVAL);
  }

  // Stop monitoring
  stopMonitoring() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
  }

  // Health check
  checkHealth() {
    const state = this.getCurrentState();
    
    // Check for stale state
    if (state.lastStateChange && 
        Date.now() - state.lastStateChange > this.config.MONITOR_INTERVAL * 3) {
      this.logFailure('HEALTH_CHECK', 'Pacer state appears stale', { state });
    }
    
    // Emit metrics
    this.emitMetrics(state);
  }

  // Emit state change event
  emitStateChange(newState, reason) {
    // In a real implementation, this would emit to event bus
    // For now, we'll just log it
    console.log(`[ARTERY-PACER] State changed to ${newState}: ${reason}`);
    
    // In SAOS context, this would update state files
    // For example: state/agent-9-insurance/pacer-state.json
  }

  // Emit metrics
  emitMetrics(state) {
    // In a real implementation, this would emit to monitoring system
    const metrics = {
      timestamp: Date.now(),
      agent: 'agent-9-insurance',
      pacer: state,
      config: this.config
    };
    
    // For now, we'll just log it
    console.log(`[ARTERY-PACER-METRICS]`, JSON.stringify(metrics));
  }

  // Get status report
  getStatusReport() {
    return {
      status: pacerState.isClosed ? 'CLOSED' : 'OPEN',
      failureCount: pacerState.failureCount,
      successCount: pacerState.successCount,
      lastActivity: {
        failure: pacerState.lastFailureTime,
        success: pacerState.lastSuccessTime
      },
      recentLog: pacerState.log.slice(-10),
      config: this.config
    };
  }
}

// Factory function to create pacer instances
export function createArteryPacer(options) {
  return new ArteryPacer(options);
}

// Unit tests (in a real implementation, these would be in a separate test file)
if (import.meta.url === `file://${process.argv[1]}`) {
  // Simple test runner
  console.log('Running artery-pacer embedded tests...');
  
  const pacer = new ArteryPacer({
    FAILURE_THRESHOLD: 3,
    RECOVERY_THRESHOLD: 2,
    TIMEOUT_MS: 1000
  });
  
  // Test 1: Successful operation
  console.log('Test 1: Successful operation');
  pacer.execute(() => Promise.resolve('success'))
    .then(result => {
      console.log('✓ Test 1 passed:', result);
      return test2();
    })
    .catch(err => console.error('✗ Test 1 failed:', err));
  
  // Test 2: Failure counting
  async function test2() {
    console.log('Test 2: Failure counting');
    
    // Simulate failures
    for (let i = 0; i < 3; i++) {
      try {
        await pacer.execute(() => Promise.reject(new Error('Test failure')));
      } catch (e) {
        console.log(`Failure ${i + 1} recorded`);
      }
    }
    
    // Check if circuit is closed
    if (pacer.isCircuitClosed()) {
      console.log('✓ Test 2 passed: Circuit correctly closed after threshold');
      return test3();
    } else {
      console.error('✗ Test 2 failed: Circuit should be closed');
    }
  }
  
  // Test 3: Recovery
  async function test3() {
    console.log('Test 3: Recovery');
    
    // Simulate successes
    for (let i = 0; i < 2; i++) {
      await pacer.execute(() => Promise.resolve('recovery success'));
    }
    
    // Check if circuit is open
    if (!pacer.isCircuitClosed()) {
      console.log('✓ Test 3 passed: Circuit correctly recovered');
      console.log('All tests completed');
    } else {
      console.error('✗ Test 3 failed: Circuit should be recovered');
    }
  }
}
