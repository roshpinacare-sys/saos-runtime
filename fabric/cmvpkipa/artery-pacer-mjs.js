import { createHash } from 'crypto';
import { EventEmitter } from 'events';

// Constants
const MAX_RETRIES = 5;
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;
const FAILURE_THRESHOLD = 0.02; // 2%
const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
const REPORT_INTERVAL = 60000; // 1 minute

// Artery Pacer Class with Auto-Recovery
class ArteryPacer extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      maxRetries: options.maxRetries || MAX_RETRIES,
      baseBackoffMs: options.baseBackoffMs || BASE_BACKOFF_MS,
      maxBackoffMs: options.maxBackoffMs || MAX_BACKOFF_MS,
      failureThreshold: options.failureThreshold || FAILURE_THRESHOLD,
      ...options
    };
    
    this.state = {
      isActive: false,
      failureCount: 0,
      successCount: 0,
      totalAttempts: 0,
      currentBackoffMs: 0,
      lastFailureTime: null,
      lastSuccessTime: null,
      health: 'unknown',
      isFailClosed: false
    };
    
    this.healthCheckInterval = null;
    this.reportInterval = null;
    this.retryTimers = new Map();
  }

  // Initialize the pacer
  async initialize() {
    this.emit('info', 'Initializing Artery Pacer with auto-recovery capabilities');
    this.startHealthChecks();
    this.startPeriodicReports();
    this.state.isActive = true;
    this.emit('initialized');
  }

  // Start the pacer
  async start() {
    if (!this.state.isActive) {
      await this.initialize();
    }
    
    this.emit('info', 'Starting Artery Pacer');
    this.state.health = 'running';
    this.emit('started');
  }

  // Stop the pacer
  async stop() {
    this.emit('info', 'Stopping Artery Pacer');
    this.state.isActive = false;
    this.state.health = 'stopped';
    
    // Clear all intervals and timers
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    if (this.reportInterval) {
      clearInterval(this.reportInterval);
    }
    
    for (const [key, timer] of this.retryTimers) {
      clearTimeout(timer);
    }
    
    this.retryTimers.clear();
    this.emit('stopped');
  }

  // Execute a task with rate limiting and auto-recovery
  async execute(taskFn, taskName = 'task') {
    if (!this.state.isActive) {
      throw new Error('Pacer is not active');
    }
    
    if (this.state.isFailClosed) {
      this.emit('warning', `Execution blocked: pacer is in fail-closed state due to persistent failures`);
      throw new Error('Pacer is in fail-closed state');
    }
    
    this.state.totalAttempts++;
    
    try {
      const result = await taskFn();
      this.recordSuccess();
      this.emit('success', { task: taskName, result });
      return result;
    } catch (error) {
      this.recordFailure(error);
      this.emit('failure', { task: taskName, error });
      
      // Attempt recovery if we haven't exceeded max retries
      if (this.state.failureCount < this.options.maxRetries) {
        await this.attemptRecovery(taskFn, taskName);
      } else {
        this.handlePermanentFailure();
      }
      
      throw error;
    }
  }

  // Record a successful execution
  recordSuccess() {
    this.state.successCount++;
    this.state.lastSuccessTime = Date.now();
    this.state.health = 'healthy';
    
    // Reset failure count if we have enough successes
    const successRate = this.state.successCount / this.state.totalAttempts;
    if (successRate > this.options.failureThreshold * 2) {
      this.state.failureCount = 0;
      this.state.currentBackoffMs = 0;
    }
  }

  // Record a failed execution
  recordFailure(error) {
    this.state.failureCount++;
    this.state.lastFailureTime = Date.now();
    this.state.health = 'degraded';
    
    // Update current backoff time
    this.state.currentBackoffMs = Math.min(
      this.state.currentBackoffMs * 2 || this.options.baseBackoffMs,
      this.options.maxBackoffMs
    );
  }

  // Attempt recovery with exponential backoff
  async attemptRecovery(taskFn, taskName) {
    const backoffTime = this.state.currentBackoffMs;
    this.emit('info', `Recovery attempt ${this.state.failureCount}/${this.options.maxRetries} scheduled in ${backoffTime}ms`);
    
    return new Promise((resolve, reject) => {
      const timerId = setTimeout(async () => {
        try {
          this.emit('info', `Recovery attempt ${this.state.failureCount} starting`);
          const result = await taskFn();
          this.recordSuccess();
          this.emit('recovery-success', { attempt: this.state.failureCount, result });
          resolve(result);
        } catch (error) {
          this.recordFailure(error);
          this.emit('recovery-failure', { attempt: this.state.failureCount, error });
          
          // If we've reached max retries, handle permanent failure
          if (this.state.failureCount >= this.options.maxRetries) {
            this.handlePermanentFailure();
          }
          
          reject(error);
        } finally {
          this.retryTimers.delete(taskName);
        }
      }, backoffTime);
      
      this.retryTimers.set(taskName, timerId);
    });
  }

  // Handle permanent failure by entering fail-closed mode
  handlePermanentFailure() {
    this.state.isFailClosed = true;
    this.state.health = 'fail-closed';
    this.emit('critical', 'Pacer entered fail-closed mode due to persistent failures');
    
    // In a real implementation, this would trigger alerting and manual intervention
    this.emit('fail-closed', {
      failureCount: this.state.failureCount,
      successCount: this.state.successCount,
      totalAttempts: this.state.totalAttempts,
      failureRate: this.state.failureCount / this.state.totalAttempts
    });
  }

  // Start periodic health checks
  startHealthChecks() {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, HEALTH_CHECK_INTERVAL);
  }

  // Perform health check
  performHealthCheck() {
    if (!this.state.isActive) return;
    
    const now = Date.now();
    const timeSinceLastActivity = Math.max(
      this.state.lastSuccessTime ? now - this.state.lastSuccessTime : Infinity,
      this.state.lastFailureTime ? now - this.state.lastFailureTime : Infinity
    );
    
    // Update health status based on recent activity
    if (timeSinceLastActivity > HEALTH_CHECK_INTERVAL * 2) {
      this.state.health = 'stale';
      this.emit('warning', 'No recent activity detected');
    } else if (this.state.isFailClosed) {
      this.state.health = 'fail-closed';
    } else if (this.state.failureCount > 0) {
      this.state.health = 'degraded';
    } else {
      this.state.health = 'healthy';
    }
    
    this.emit('health-check', { 
      health: this.state.health, 
      timeSinceLastActivity,
      ...this.state
    });
  }

  // Start periodic status reports
  startPeriodicReports() {
    this.reportInterval = setInterval(() => {
      this.generateStatusReport();
    }, REPORT_INTERVAL);
  }

  // Generate status report
  generateStatusReport() {
    if (!this.state.isActive) return;
    
    const failureRate = this.state.totalAttempts > 0 
      ? this.state.failureCount / this.state.totalAttempts 
      : 0;
    
    const report = {
      timestamp: new Date().toISOString(),
      health: this.state.health,
      isFailClosed: this.state.isFailClosed,
      stats: {
        totalAttempts: this.state.totalAttempts,
        successCount: this.state.successCount,
        failureCount: this.state.failureCount,
        failureRate: failureRate,
        currentBackoffMs: this.state.currentBackoffMs
      },
      uptime: this.state.isActive ? Date.now() - (this.state.lastSuccessTime || Date.now()) : 0
    };
    
    this.emit('status-report', report);
    
    // Log if we're approaching failure threshold
    if (failureRate > this.options.failureThreshold * 0.8) {
      this.emit('warning', `High failure rate detected: ${(failureRate * 100).toFixed(2)}%`);
    }
  }

  // Get current status
  getStatus() {
    const failureRate = this.state.totalAttempts > 0 
      ? this.state.failureCount / this.state.totalAttempts 
      : 0;
    
    return {
      isActive: this.state.isActive,
      health: this.state.health,
      isFailClosed: this.state.isFailClosed,
      stats: {
        totalAttempts: this.state.totalAttempts,
        successCount: this.state.successCount,
        failureCount: this.state.failureCount,
        failureRate: failureRate,
        currentBackoffMs: this.state.currentBackoffMs
      }
    };
  }

  // Manually trigger recovery
  async manualRecovery() {
    if (!this.state.isFailClosed) {
      this.emit('info', 'Manual recovery requested but pacer is not in fail-closed state');
      return;
    }
    
    this.emit('info', 'Manual recovery initiated');
    this.state.failureCount = 0;
    this.state.currentBackoffMs = 0;
    this.state.isFailClosed = false;
    this.state.health = 'recovering';
    
    this.emit('recovery-initiated');
  }
}

// Export the pacer
export default ArteryPacer;

// Example usage:
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    const pacer = new ArteryPacer({
      maxRetries: 3,
      baseBackoffMs: 2000,
      failureThreshold: 0.02
    });
    
    // Listen for events
    pacer.on('status-report', (report) => {
      console.log('Status Report:', report);
    });
    
    pacer.on('failure', (data) => {
      console.error('Task failed:', data);
    });
    
    pacer.on('success', (data) => {
      console.log('Task succeeded:', data);
    });
    
    pacer.on('critical', (msg) => {
      console.error('CRITICAL:', msg);
    });
    
    // Start the pacer
    await pacer.start();
    
    // Simulate some tasks
    const simulateTask = (shouldFail = false) => {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          if (shouldFail) {
            reject(new Error('Simulated task failure'));
          } else {
            resolve({ success: true });
          }
        }, 100);
      });
    };
    
    // Run some tasks
    try {
      await pacer.execute(() => simulateTask(false), 'task1');
      await pacer.execute(() => simulateTask(true), 'task2'); // This will fail
      await pacer.execute(() => simulateTask(false), 'task3');
      await pacer.execute(() => simulateTask(true), 'task4'); // This will fail
      await pacer.execute(() => simulateTask(true), 'task5'); // This will fail
    } catch (error) {
      console.log('Caught error:', error.message);
    }
    
    // Check status
    console.log('Current status:', pacer.getStatus());
    
    // Wait a bit to see recovery attempts
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Stop the pacer
    await pacer.stop();
  })();
}
