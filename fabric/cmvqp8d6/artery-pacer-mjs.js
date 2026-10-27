import { createHash } from 'crypto';
import { performance } from 'perf_hooks';

// EWMA calculator for dynamic load prediction
class EWMA {
  constructor(alpha = 0.3) {
    this.alpha = alpha;
    this.value = 0;
  }

  update(newValue) {
    this.value = this.alpha * newValue + (1 - this.alpha) * this.value;
    return this.value;
  }

  getValue() {
    return this.value;
  }

  reset() {
    this.value = 0;
  }
}

// Artery Pacer implementation
class ArteryPacer {
  constructor(options = {}) {
    this.maxLoadThreshold = options.maxLoadThreshold || 0.8;
    this.minLoadThreshold = options.minLoadThreshold || 0.3;
    this.adjustmentFactor = options.adjustmentFactor || 0.1;
    this.recoveryFactor = options.recoveryFactor || 0.05;
    this.warningThreshold = options.warningThreshold || 0.7;
    
    this.ewma = new EWMA(options.ewmaAlpha || 0.3);
    this.currentRate = options.initialRate || 1.0;
    this.minRate = options.minRate || 0.1;
    this.maxRate = options.maxRate || 2.0;
    
    this.eventLog = [];
    this.lastAdjustmentTime = 0;
    this.adjustmentCooldownMs = options.adjustmentCooldownMs || 5000;
    
    this.metrics = {
      loadMeasurements: [],
      rateAdjustments: [],
      warnings: []
    };
  }

  // Record a load measurement (0.0 to 1.0)
  recordLoad(load) {
    if (load < 0 || load > 1) {
      throw new Error('Load must be between 0.0 and 1.0');
    }
    
    const timestamp = performance.now();
    const smoothedLoad = this.ewma.update(load);
    
    this.metrics.loadMeasurements.push({
      timestamp,
      rawLoad: load,
      smoothedLoad
    });
    
    // Check for warnings
    if (smoothedLoad > this.warningThreshold && smoothedLoad <= this.maxLoadThreshold) {
      this._logWarning('approaching_threshold', smoothedLoad, timestamp);
    }
    
    // Adjust rate if needed
    if (timestamp - this.lastAdjustmentTime > this.adjustmentCooldownMs) {
      this._adjustRate(smoothedLoad, timestamp);
    }
    
    return smoothedLoad;
  }

  // Adjust processing rate based on load
  _adjustRate(load, timestamp) {
    let newRate = this.currentRate;
    let adjustmentType = 'none';
    
    if (load > this.maxLoadThreshold) {
      // Reduce rate when load is too high
      const reduction = Math.min(
        this.adjustmentFactor,
        (load - this.maxLoadThreshold) * 2
      );
      newRate = Math.max(this.minRate, this.currentRate - reduction);
      adjustmentType = 'reduction';
    } else if (load < this.minLoadThreshold && this.currentRate < this.maxRate) {
      // Increase rate when load is low
      const increase = Math.min(
        this.recoveryFactor,
        (this.minLoadThreshold - load) * 1.5
      );
      newRate = Math.min(this.maxRate, this.currentRate + increase);
      adjustmentType = 'increase';
    }
    
    if (newRate !== this.currentRate) {
      this.currentRate = newRate;
      this.lastAdjustmentTime = timestamp;
      
      this.metrics.rateAdjustments.push({
        timestamp,
        oldRate: this.currentRate,
        newRate,
        load,
        adjustmentType
      });
      
      this._logEvent('rate_adjustment', {
        oldRate: this.currentRate,
        newRate,
        load,
        adjustmentType
      }, timestamp);
    }
  }

  // Log a warning event
  _logWarning(type, load, timestamp) {
    const warning = {
      type,
      load,
      timestamp,
      currentRate: this.currentRate
    };
    
    this.metrics.warnings.push(warning);
    this._logEvent('warning', warning, timestamp);
  }

  // Log any event
  _logEvent(type, data, timestamp) {
    const event = {
      type,
      data,
      timestamp
    };
    
    this.eventLog.push(event);
    
    // Keep only the last 1000 events
    if (this.eventLog.length > 1000) {
      this.eventLog = this.eventLog.slice(-1000);
    }
  }

  // Get current rate
  getCurrentRate() {
    return this.currentRate;
  }

  // Get metrics for analysis
  getMetrics() {
    return {
      currentRate: this.currentRate,
      ewmaValue: this.ewma.getValue(),
      eventLog: [...this.eventLog],
      metrics: {
        ...this.metrics,
        loadMeasurements: [...this.metrics.loadMeasurements],
        rateAdjustments: [...this.metrics.rateAdjustments],
        warnings: [...this.metrics.warnings]
      }
    };
  }

  // Reset pacer state
  reset() {
    this.ewma.reset();
    this.currentRate = 1.0;
    this.eventLog = [];
    this.lastAdjustmentTime = 0;
    this.metrics = {
      loadMeasurements: [],
      rateAdjustments: [],
      warnings: []
    };
  }
}

// Agent-9 Insurance integration
class Agent9Insurance {
  constructor(pacer) {
    this.pacer = pacer;
    this.healthChecks = [];
    this.lastHealthCheck = 0;
    this.healthCheckIntervalMs = 30000; // 30 seconds
  }

  // Simulate a health check for agent-9
  performHealthCheck() {
    const now = performance.now();
    
    if (now - this.lastHealthCheck < this.healthCheckIntervalMs) {
      return;
    }
    
    this.lastHealthCheck = now;
    
    // Simulate health check with some randomness
    const isHealthy = Math.random() > 0.1; // 90% chance of being healthy
    const load = Math.random(); // Random load between 0 and 1
    
    this.healthChecks.push({
      timestamp: now,
      isHealthy,
      load
    });
    
    // Record load with pacer
    this.pacer.recordLoad(load);
    
    // If not healthy, reduce rate
    if (!isHealthy) {
      this.pacer._logEvent('agent_9_unhealthy', { isHealthy }, now);
    }
  }

  // Get health check history
  getHealthHistory() {
    return [...this.healthChecks];
  }
}

// Unit tests for the pacer
function runTests() {
  console.log('Running Artery Pacer tests...');
  
  // Test 1: Basic EWMA calculation
  const ewma = new EWMA(0.5);
  ewma.update(0.8);
  ewma.update(0.4);
  
  if (Math.abs(ewma.getValue() - 0.6) > 0.01) {
    throw new Error('EWMA calculation failed');
  }
  console.log('✓ EWMA calculation test passed');
  
  // Test 2: Rate reduction under high load
  const pacer = new ArteryPacer({ maxLoadThreshold: 0.6 });
  pacer.recordLoad(0.9);
  
  if (pacer.getCurrentRate() >= 1.0) {
    throw new Error('Rate should be reduced under high load');
  }
  console.log('✓ Rate reduction test passed');
  
  // Test 3: Rate increase under low load
  pacer.reset();
  pacer.recordLoad(0.2);
  pacer.recordLoad(0.1);
  
  if (pacer.getCurrentRate() <= 1.0) {
    throw new Error('Rate should be increased under low load');
  }
  console.log('✓ Rate increase test passed');
  
  // Test 4: Warning threshold
  pacer.reset();
  pacer.recordLoad(0.7); // Should trigger warning
  
  const warnings = pacer.getMetrics().warnings;
  if (warnings.length === 0 || warnings[0].type !== 'approaching_threshold') {
    throw new Error('Warning threshold not triggered');
  }
  console.log('✓ Warning threshold test passed');
  
  // Test 5: Agent-9 integration
  const agent9 = new Agent9Insurance(pacer);
  agent9.performHealthCheck();
  
  const healthHistory = agent9.getHealthHistory();
  if (healthHistory.length === 0) {
    throw new Error('Agent-9 health check not recorded');
  }
  console.log('✓ Agent-9 integration test passed');
  
  console.log('All tests passed!');
}

// Export classes and functions
export { ArteryPacer, EWMA, Agent9Insurance };

// If run directly, execute tests
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests();
}
