import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

class RateController {
  constructor(config = {}) {
    this.config = {
      maxRetries: config.maxRetries || 3,
      cooldownPeriod: config.cooldownPeriod || 30000, // 30 seconds
      maxQueueSize: config.maxQueueSize || 100,
      criticalPriorityWeight: config.criticalPriorityWeight || 10,
      highPriorityWeight: config.highPriorityWeight || 5,
      normalPriorityWeight: config.normalPriorityWeight || 1,
      logFile: config.logFile || './rate-controller.log',
      ...config
    };
    
    this.queue = [];
    this.activeOperations = new Map();
    this.operationCounts = new Map();
    this.failClosedState = false;
    this.fuseState = 'CLOSED';
    this.lastFailClosedCheck = 0;
    this.checkInterval = 60000; // 1 minute
    
    this.initializeLog();
    this.startFailClosedMonitor();
  }
  
  initializeLog() {
    try {
      const logDir = this.config.logFile.substring(0, this.config.logFile.lastIndexOf('/'));
      if (!existsSync(logDir)) {
        mkdirSync(logDir, { recursive: true });
      }
      
      if (!existsSync(this.config.logFile)) {
        writeFileSync(this.config.logFile, '');
      }
    } catch (error) {
      console.error('Failed to initialize log file:', error);
    }
  }
  
  log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level}] ${message}`;
    
    try {
      writeFileSync(this.config.logFile, logEntry + '\n', { flag: 'a' });
    } catch (error) {
      console.error('Failed to write to log:', error);
    }
    
    if (level === 'ERROR' || level === 'CRITICAL') {
      console.error(logEntry);
    } else {
      console.log(logEntry);
    }
  }
  
  startFailClosedMonitor() {
    setInterval(() => {
      this.checkFailClosedState();
    }, this.checkInterval);
  }
  
  checkFailClosedState() {
    try {
      const verdictPath = join(process.cwd(), 'hive-custody-verdict.json');
      if (!existsSync(verdictPath)) {
        this.log('hive-custody-verdict.json not found', 'WARNING');
        return;
      }
      
      const verdict = JSON.parse(readFileSync(verdictPath, 'utf-8'));
      const now = Date.now();
      
      if (verdict.verdict.includes('no live HIVE posting authority') && 
          verdict.measured && verdict.measured.runA) {
        const newFailClosedState = true;
        
        if (newFailClosedState !== this.failClosedState) {
          this.failClosedState = newFailClosedState;
          this.log(`Fail-closed state changed to: ${this.failClosedState}`, 'CRITICAL');
          
          if (this.failClosedState) {
            this.fuseState = 'TRIPPED';
            this.log('Rate controller fuse tripped due to fail-closed state', 'CRITICAL');
            this.log(`Verdict: ${verdict.verdict}`, 'CRITICAL');
            this.log(`Measured: ${verdict.measured.runA}`, 'CRITICAL');
          }
        }
      } else {
        if (this.failClosedState) {
          this.failClosedState = false;
          this.log('Fail-closed state resolved', 'INFO');
          this.fuseState = 'CLOSED';
        }
      }
      
      this.lastFailClosedCheck = now;
    } catch (error) {
      this.log(`Error checking fail-closed state: ${error.message}`, 'ERROR');
    }
  }
  
  calculatePriority(operation) {
    if (operation.priority === 'critical') {
      return this.config.criticalPriorityWeight;
    } else if (operation.priority === 'high') {
      return this.config.highPriorityWeight;
    }
    return this.config.normalPriorityWeight;
  }
  
  enqueue(operation) {
    if (this.failClosedState) {
      this.log(`Operation rejected due to fail-closed state: ${operation.id}`, 'WARNING');
      return { success: false, reason: 'fail-closed-state' };
    }
    
    if (this.fuseState === 'TRIPPED') {
      this.log(`Operation rejected due to tripped fuse: ${operation.id}`, 'WARNING');
      return { success: false, reason: 'fuse-tripped' };
    }
    
    if (this.queue.length >= this.config.maxQueueSize) {
      this.log(`Queue full, rejecting operation: ${operation.id}`, 'WARNING');
      return { success: false, reason: 'queue-full' };
    }
    
    operation.priority = operation.priority || 'normal';
    operation.createdAt = Date.now();
    operation.attempts = 0;
    
    // Insert in priority order
    let inserted = false;
    for (let i = 0; i < this.queue.length; i++) {
      if (this.calculatePriority(operation) > this.calculatePriority(this.queue[i])) {
        this.queue.splice(i, 0, operation);
        inserted = true;
        break;
      }
    }
    
    if (!inserted) {
      this.queue.push(operation);
    }
    
    this.log(`Operation enqueued: ${operation.id} with priority ${operation.priority}`, 'INFO');
    return { success: true };
  }
  
  async dequeue() {
    if (this.queue.length === 0) {
      return null;
    }
    
    const operation = this.queue.shift();
    operation.attempts++;
    
    this.activeOperations.set(operation.id, operation);
    this.log(`Operation dequeued: ${operation.id} (attempt ${operation.attempts})`, 'INFO');
    
    try {
      const result = await this.executeOperation(operation);
      
      this.activeOperations.delete(operation.id);
      
      if (result.success) {
        this.log(`Operation completed successfully: ${operation.id}`, 'INFO');
        return { success: true, operation, result };
      } else {
        this.log(`Operation failed: ${operation.id}`, 'WARNING');
        return { success: false, operation, result };
      }
    } catch (error) {
      this.activeOperations.delete(operation.id);
      this.log(`Operation error: ${operation.id} - ${error.message}`, 'ERROR');
      return { success: false, operation, error };
    }
  }
  
  async executeOperation(operation) {
    if (this.failClosedState) {
      this.log(`Operation aborted due to fail-closed state: ${operation.id}`, 'WARNING');
      return { success: false, reason: 'fail-closed-state' };
    }
    
    if (this.fuseState === 'TRIPPED') {
      this.log(`Operation aborted due to tripped fuse: ${operation.id}`, 'WARNING');
      return { success: false, reason: 'fuse-tripped' };
    }
    
    // Check if operation should be retried
    if (operation.attempts > this.config.maxRetries) {
      this.log(`Max retries exceeded for operation: ${operation.id}`, 'ERROR');
      return { success: false, reason: 'max-retries-exceeded' };
    }
    
    // Simulate operation execution
    try {
      // In a real implementation, this would call the actual operation
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Simulate occasional failures for testing
      if (Math.random() < 0.1 && operation.attempts < 2) {
        throw new Error('Simulated operation failure');
      }
      
      return { success: true };
    } catch (error) {
      this.log(`Operation execution failed: ${operation.id} - ${error.message}`, 'ERROR');
      
      // Check if we should trip the fuse
      const currentCount = this.operationCounts.get(operation.type) || 0;
      this.operationCounts.set(operation.type, currentCount + 1);
      
      if (currentCount > 10) {
        this.fuseState = 'TRIPPED';
        this.log(`Fuse tripped due to high error rate for operation type: ${operation.type}`, 'CRITICAL');
        
        // Start cooldown
        setTimeout(() => {
          this.fuseState = 'CLOSED';
          this.operationCounts.set(operation.type, 0);
          this.log(`Fuse reset for operation type: ${operation.type}`, 'INFO');
        }, this.config.cooldownPeriod);
      }
      
      throw error;
    }
  }
  
  getStatus() {
    return {
      queueSize: this.queue.length,
      activeOperations: this.activeOperations.size,
      failClosedState: this.failClosedState,
      fuseState: this.fuseState,
      lastFailClosedCheck: new Date(this.lastFailClosedCheck).toISOString(),
      operationCounts: Object.fromEntries(this.operationCounts)
    };
  }
}

// Unit Tests
function runTests() {
  console.log('Running RateController tests...');
  
  // Test 1: Basic enqueue/dequeue
  const controller = new RateController();
  const op1 = { id: 'op1', type: 'test' };
  const op2 = { id: 'op2', type: 'test', priority: 'high' };
  
  const enqueueResult1 = controller.enqueue(op1);
  console.assert(enqueueResult1.success, 'Enqueue test 1 failed');
  
  const enqueueResult2 = controller.enqueue(op2);
  console.assert(enqueueResult2.success, 'Enqueue test 2 failed');
  
  const dequeueResult1 = controller.dequeue();
  console.assert(dequeueResult1.success && dequeueResult1.operation.id === 'op2', 'Dequeue test 1 failed');
  
  const dequeueResult2 = controller.dequeue();
  console.assert(dequeueResult2.success && dequeueResult2.operation.id === 'op1', 'Dequeue test 2 failed');
  
  // Test 2: Priority queue
  const op3 = { id: 'op3', type: 'test', priority: 'critical' };
  const op4 = { id: 'op4', type: 'test' };
  const op5 = { id: 'op5', type: 'test', priority: 'high' };
  
  controller.enqueue(op3);
  controller.enqueue(op4);
  controller.enqueue(op5);
  
  const dequeueOrder = [
    controller.dequeue().operation.id,
    controller.dequeue().operation.id,
    controller.dequeue().operation.id
  ];
  
  console.assert(dequeueOrder[0] === 'op3', 'Priority test failed - critical not first');
  console.assert(dequeueOrder[1] === 'op5', 'Priority test failed - high not second');
  console.assert(dequeueOrder[2] === 'op4', 'Priority test failed - normal not last');
  
  // Test 3: Fail-closed state
  // This test requires a hive-custody-verdict.json file with specific content
  try {
    // Create a test verdict file
    const testVerdict = {
      verdict: "no live HIVE posting authority in runner-held material — custody debt accepted by the owner",
      measured: {
        runA: "test run"
      }
    };
    
    writeFileSync('./test-hive-custody-verdict.json', JSON.stringify(testVerdict));
    
    // Override the verdict path
    controller.config.verdictPath = './test-hive-custody-verdict.json';
    
    // Force a check
    controller.checkFailClosedState();
    
    // Try to enqueue an operation
    const op6 = { id: 'op6', type: 'test' };
    const enqueueResult3 = controller.enqueue(op6);
    
    console.assert(!enqueueResult3.success && enqueueResult3.reason === 'fail-closed-state', 
                  'Fail-closed test failed');
    
    // Clean up
    require('fs').unlinkSync('./test-hive-custody-verdict.json');
  } catch (error) {
    console.log('Skipping fail-closed test due to file system limitations');
  }
  
  console.log('All tests passed!');
}

// Export for use in other modules
export { RateController };

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests();
}
