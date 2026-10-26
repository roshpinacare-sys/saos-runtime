import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { blurtNodes } from '../blurt-nodes.json';

class HiveRevivalAgent {
  constructor() {
    this.stateFile = join(process.cwd(), 'state', 'hive-revival-state.json');
    this.maxRetries = 5;
    this.baseDelay = 1000; // 1 second base delay
    this.maxDelay = 30000; // 30 seconds max delay
    this.nodeIndex = 0;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastSuccessTime = null;
    this.circuitBreaker = {
      isOpen: false,
      failureThreshold: 3,
      recoveryTimeout: 60000, // 1 minute
      lastFailureTime: null
    };
    
    // Load existing state if available
    this.loadState();
  }

  loadState() {
    try {
      if (existsSync(this.stateFile)) {
        const data = readFileSync(this.stateFile, 'utf8');
        const state = JSON.parse(data);
        this.nodeIndex = state.nodeIndex || 0;
        this.failureCount = state.failureCount || 0;
        this.successCount = state.successCount || 0;
        this.lastSuccessTime = state.lastSuccessTime || null;
        this.circuitBreaker = {
          ...this.circuitBreaker,
          ...state.circuitBreaker
        };
      }
    } catch (error) {
      console.error('Failed to load state:', error.message);
    }
  }

  saveState() {
    try {
      const state = {
        nodeIndex: this.nodeIndex,
        failureCount: this.failureCount,
        successCount: this.successCount,
        lastSuccessTime: this.lastSuccessTime,
        circuitBreaker: this.circuitBreaker,
        timestamp: new Date().toISOString()
      };
      writeFileSync(this.stateFile, JSON.stringify(state, null, 2));
    } catch (error) {
      console.error('Failed to save state:', error.message);
    }
  }

  // Method to detect network failures
  detectFailure(error) {
    console.error('Failure detected:', error.message);
    this.failureCount++;
    this.circuitBreaker.lastFailureTime = Date.now();
    
    // Open circuit breaker if failure threshold is reached
    if (this.failureCount >= this.circuitBreaker.failureThreshold) {
      this.circuitBreaker.isOpen = true;
      console.log('Circuit breaker opened due to excessive failures');
    }
    
    this.saveState();
    return true;
  }

  // Method to check if circuit breaker is open
  isCircuitBreakerOpen() {
    if (!this.circuitBreaker.isOpen) return false;
    
    const timeSinceLastFailure = Date.now() - this.circuitBreaker.lastFailureTime;
    if (timeSinceLastFailure > this.circuitBreaker.recoveryTimeout) {
      this.circuitBreaker.isOpen = false;
      console.log('Circuit breaker closed after recovery timeout');
      this.saveState();
      return false;
    }
    
    return true;
  }

  // Calculate delay with exponential backoff
  calculateDelay(attempt) {
    const delay = Math.min(this.baseDelay * Math.pow(2, attempt), this.maxDelay);
    // Add jitter to avoid thundering herd
    const jitter = delay * 0.2 * (Math.random() - 0.5);
    return Math.max(0, delay + jitter);
  }

  // Method to attempt recovery
  async attemptRecovery(attempt = 0) {
    if (attempt >= this.maxRetries) {
      console.log('Max retries reached, giving up');
      return false;
    }

    // Check circuit breaker
    if (this.isCircuitBreakerOpen()) {
      const remainingTime = Math.ceil((this.circuitBreaker.recoveryTimeout - 
        (Date.now() - this.circuitBreaker.lastFailureTime)) / 1000);
      console.log(`Circuit breaker open, waiting ${remainingTime} seconds`);
      await this.sleep(remainingTime * 1000);
      return this.attemptRecovery(0); // Reset attempt counter after recovery timeout
    }

    // Select next node with round-robin
    const currentNode = blurtNodes.nodes[this.nodeIndex % blurtNodes.nodes.length];
    this.nodeIndex++;
    
    console.log(`Attempt ${attempt + 1}: Trying node ${currentNode}`);
    
    try {
      // Simulate API call to Hive node
      const result = await this.callHiveNode(currentNode);
      
      // Success handling
      this.successCount++;
      this.lastSuccessTime = Date.now();
      this.failureCount = 0; // Reset failure count on success
      
      // Close circuit breaker if it was open
      if (this.circuitBreaker.isOpen) {
        this.circuitBreaker.isOpen = false;
        console.log('Circuit breaker closed after successful recovery');
      }
      
      this.saveState();
      return result;
    } catch (error) {
      this.detectFailure(error);
      
      // Calculate delay for next attempt
      const delay = this.calculateDelay(attempt);
      console.log(`Attempt failed, waiting ${delay}ms before next try`);
      
      await this.sleep(delay);
      return this.attemptRecovery(attempt + 1);
    }
  }

  // Simulate calling a Hive node
  async callHiveNode(nodeUrl) {
    // In a real implementation, this would make an actual HTTP request
    // For this example, we'll simulate success/failure based on node index
    const nodeIndex = blurtNodes.nodes.indexOf(nodeUrl);
    
    // Simulate some nodes failing
    if (nodeIndex % 3 === 0 && Math.random() > 0.3) {
      throw new Error(`Node ${nodeUrl} is unreachable`);
    }
    
    // Simulate network latency
    await this.sleep(100 + Math.random() * 200);
    
    return {
      success: true,
      node: nodeUrl,
      timestamp: new Date().toISOString(),
      data: `Revival data from ${nodeUrl}`
    };
  }

  // Sleep utility function
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Generate status report
  generateStatusReport() {
    const uptime = this.lastSuccessTime ? 
      Date.now() - this.lastSuccessTime : null;
    
    return {
      agent: 'hive-revival',
      timestamp: new Date().toISOString(),
      status: this.circuitBreaker.isOpen ? 'degraded' : 'healthy',
      currentNodeIndex: this.nodeIndex % blurtNodes.nodes.length,
      stats: {
        successCount: this.successCount,
        failureCount: this.failureCount,
        uptime: uptime ? `${Math.floor(uptime / 1000)}s` : 'unknown'
      },
      circuitBreaker: {
        isOpen: this.circuitBreaker.isOpen,
        failureThreshold: this.circuitBreaker.failureThreshold,
        recoveryTimeout: `${this.circuitBreaker.recoveryTimeout}ms`
      },
      nodes: blurtNodes.nodes.map((node, i) => ({
        url: node,
        status: i % 3 === 0 && Math.random() > 0.7 ? 'degraded' : 'healthy'
      }))
    };
  }
}

// Main execution function
async function main() {
  const agent = new HiveRevivalAgent();
  
  console.log('Starting Hive Revival Agent...');
  
  try {
    // Attempt recovery
    const result = await agent.attemptRecovery();
    
    if (result) {
      console.log('Recovery successful:', result);
    } else {
      console.log('Recovery failed after all attempts');
    }
    
    // Generate and log status report
    const report = agent.generateStatusReport();
    console.log('Status Report:', JSON.stringify(report, null, 2));
    
    // Save final state
    agent.saveState();
  } catch (error) {
    console.error('Fatal error in revival agent:', error);
    process.exit(1);
  }
}

// Run if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default HiveRevivalAgent;