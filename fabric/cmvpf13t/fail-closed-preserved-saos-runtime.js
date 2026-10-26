import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// Load configuration and verdict
const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));
const verdictPath = join(process.cwd(), 'hive-custody-verdict.json');
const verdict = existsSync(verdictPath) ? JSON.parse(readFileSync(verdictPath, 'utf8')) : null;
const stateDir = join(process.cwd(), 'state', 'pulse-guardian');
if (!existsSync(stateDir)) mkdirSync(stateDir, { recursive: true });

// Pulse Guardian Class
class PulseGuardian {
  constructor() {
    this.state = {
      heartbeat: null,
      overloadState: 'normal',
      lastOverloadTime: null,
      recoveryWindow: null,
      eventLog: [],
      loadHistory: [],
      maxLoadHistory: 100
    };
    
    this.loadState();
    this.startHeartbeat();
  }

  // Local heartbeat for self-validation
  startHeartbeat() {
    setInterval(() => {
      const now = new Date().toISOString();
      const heartbeat = {
        timestamp: now,
        pid: process.pid,
        version: packageJson.version,
        state: this.state.overloadState,
        load: this.getCurrentLoad()
      };
      
      this.state.heartbeat = heartbeat;
      this.logEvent('heartbeat', { heartbeat });
      this.saveState();
    }, 60000); // Every minute
  }

  // Get current system load (simplified)
  getCurrentLoad() {
    return {
      memory: process.memoryUsage(),
      uptime: process.uptime(),
      eventQueueLength: this.state.eventLog.length
    };
  }

  // Check for overload and apply fail-closed logic
  checkOverload() {
    const load = this.getCurrentLoad();
    const loadFactor = this.calculateLoadFactor(load);
    
    // Add to load history
    this.state.loadHistory.push({
      timestamp: new Date().toISOString(),
      factor: loadFactor
    });
    
    if (this.state.loadHistory.length > this.state.maxLoadHistory) {
      this.state.loadHistory.shift();
    }
    
    // Determine if we're overloaded
    const isOverloaded = loadFactor > 0.8; // 80% threshold
    
    if (isOverloaded && this.state.overloadState === 'normal') {
      this.enterOverloadState(loadFactor);
    } else if (!isOverloaded && this.state.overloadState === 'overloaded') {
      this.startRecovery();
    }
    
    return {
      isOverloaded,
      loadFactor,
      state: this.state.overloadState
    };
  }

  // Calculate load factor based on multiple metrics
  calculateLoadFactor(load) {
    // Simplified load calculation
    const memoryFactor = Math.min(load.memory.heapUsed / load.memory.heapTotal, 1);
    const queueFactor = Math.min(load.eventQueueLength / 1000, 1);
    const uptimeFactor = Math.min(load.uptime / 86400, 1); // Normalize by day
    
    // Weighted average
    return (memoryFactor * 0.5) + (queueFactor * 0.3) + (uptimeFactor * 0.2);
  }

  // Enter overload state with fail-closed preserved logic
  enterOverloadState(loadFactor) {
    this.state.overloadState = 'overloaded';
    this.state.lastOverloadTime = new Date().toISOString();
    
    // Apply verdict logic if available
    if (verdict && verdict.judgment && verdict.judgment.liveHits === 0) {
      this.state.overloadState = 'fail-closed';
      this.logEvent('fail-closed-activated', { 
        reason: 'liveHits=0 in verdict', 
        verdict: verdict.judgment,
        loadFactor 
      });
    } else {
      this.logEvent('overload-detected', { loadFactor });
    }
    
    this.saveState();
  }

  // Start recovery process
  startRecovery() {
    this.state.overloadState = 'recovering';
    this.state.recoveryWindow = {
      start: new Date().toISOString(),
      duration: 300000 // 5 minutes
    };
    
    this.logEvent('recovery-started', { 
      previousState: 'overloaded',
      recoveryWindow: this.state.recoveryWindow
    });
    
    // Set timeout to complete recovery
    setTimeout(() => {
      if (this.state.overloadState === 'recovering') {
        this.completeRecovery();
      }
    }, this.state.recoveryWindow.duration);
    
    this.saveState();
  }

  // Complete recovery process
  completeRecovery() {
    this.state.overloadState = 'normal';
    this.state.recoveryWindow = null;
    
    this.logEvent('recovery-completed', { 
      timestamp: new Date().toISOString()
    });
    
    this.saveState();
  }

  // Log events with detailed information
  logEvent(type, data) {
    const event = {
      timestamp: new Date().toISOString(),
      type,
      data,
      state: this.state.overloadState,
      load: this.getCurrentLoad()
    };
    
    this.state.eventLog.push(event);
    
    // Keep only last 1000 events
    if (this.state.eventLog.length > 1000) {
      this.state.eventLog.shift();
    }
  }

  // Save current state to disk
  saveState() {
    const statePath = join(stateDir, 'state.json');
    try {
      writeFileSync(statePath, JSON.stringify(this.state, null, 2));
    } catch (err) {
      this.logEvent('state-save-error', { error: err.message });
    }
  }

  // Load state from disk
  loadState() {
    const statePath = join(stateDir, 'state.json');
    if (existsSync(statePath)) {
      try {
        const savedState = JSON.parse(readFileSync(statePath, 'utf8'));
        this.state = { ...this.state, ...savedState };
        this.logEvent('state-loaded', { timestamp: this.state.heartbeat?.timestamp });
      } catch (err) {
        this.logEvent('state-load-error', { error: err.message });
      }
    }
  }

  // Get current status
  getStatus() {
    return {
      state: this.state.overloadState,
      heartbeat: this.state.heartbeat,
      lastOverloadTime: this.state.lastOverloadTime,
      recoveryWindow: this.state.recoveryWindow,
      recentEvents: this.state.eventLog.slice(-5),
      loadHistory: this.state.loadHistory.slice(-10)
    };
  }
}

// Unit tests
function runTests() {
  console.log('Running Pulse Guardian tests...');
  
  // Test 1: Initial state
  const guardian = new PulseGuardian();
  if (guardian.state.overloadState !== 'normal') {
    throw new Error('Test 1 failed: Initial state should be normal');
  }
  console.log('Test 1 passed: Initial state is normal');
  
  // Test 2: Overload detection
  const originalLoadFactor = guardian.calculateLoadFactor(guardian.getCurrentLoad());
  // Simulate high load
  const highLoad = {
    memory: { heapUsed: 800000000, heapTotal: 1000000000 },
    uptime: 100000,
    eventQueueLength: 900
  };
  
  const highLoadFactor = guardian.calculateLoadFactor(highLoad);
  if (highLoadFactor <= 0.8) {
    throw new Error('Test 2 failed: High load should exceed threshold');
  }
  console.log('Test 2 passed: High load detection works');
  
  // Test 3: Fail-closed logic
  // Mock verdict with liveHits=0
  const mockVerdict = {
    judgment: {
      liveHits: 0
    }
  };
  
  // Temporarily replace verdict
  const originalVerdict = verdict;
  global.verdict = mockVerdict;
  
  // Simulate overload with verdict
  guardian.enterOverloadState(highLoadFactor);
  if (guardian.state.overloadState !== 'fail-closed') {
    throw new Error('Test 3 failed: Fail-closed state not activated');
  }
  console.log('Test 3 passed: Fail-closed logic works');
  
  // Restore verdict
  global.verdict = originalVerdict;
  
  // Test 4: Recovery process
  guardian.startRecovery();
  if (guardian.state.overloadState !== 'recovering') {
    throw new Error('Test 4 failed: Recovery state not set');
  }
  console.log('Test 4 passed: Recovery process starts correctly');
  
  // Complete recovery
  guardian.completeRecovery();
  if (guardian.state.overloadState !== 'normal') {
    throw new Error('Test 5 failed: Recovery not completed');
  }
  console.log('Test 5 passed: Recovery completes successfully');
  
  console.log('All tests passed!');
}

// Export and run
if (import.meta.url === `file://${process.argv[1]}`) {
  // Run tests if this file is executed directly
  runTests();
} else {
  // Export the class if imported
  export { PulseGuardian };
}
