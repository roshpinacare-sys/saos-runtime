import { createHash } from 'crypto';
import { writeFileSync, existsSync, mkdirSync, appendFileSync } from 'fs';
import { join } from 'path';

// Configuration
const CONFIG = {
  maxRetries: 5,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  criticalAgentThreshold: 0.7,
  loadBalancingFactor: 0.5,
  logDirectory: 'state/recovery-logs',
  agentsDirectory: 'agents',
  stateDirectory: 'state'
};

// Recovery log class
class RecoveryLogger {
  constructor() {
    if (!existsSync(CONFIG.logDirectory)) {
      mkdirSync(CONFIG.logDirectory, { recursive: true });
    }
    this.logFile = join(CONFIG.logDirectory, `recovery-${new Date().toISOString().slice(0, 10)}.jsonl`);
  }

  log(event) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      ...event
    };
    appendFileSync(this.logFile, JSON.stringify(logEntry) + '\n');
  }
}

// Exponential backoff strategy
class ExponentialBackoff {
  constructor(maxRetries, initialDelay, maxDelay) {
    this.maxRetries = maxRetries;
    this.initialDelay = initialDelay;
    this.maxDelay = maxDelay;
    this.attempts = 0;
  }

  nextDelay() {
    if (this.attempts >= this.maxRetries) {
      throw new Error('Max retries exceeded');
    }
    
    const delay = Math.min(
      this.initialDelay * Math.pow(2, this.attempts),
      this.maxDelay
    );
    
    this.attempts++;
    return delay;
  }

  reset() {
    this.attempts = 0;
  }
}

// Load monitoring system
class LoadMonitor {
  constructor() {
    this.agentLoads = new Map();
    this.criticalAgents = new Set();
  }

  updateAgentLoad(agentId, load) {
    this.agentLoads.set(agentId, load);
    this.identifyCriticalAgents();
  }

  identifyCriticalAgents() {
    const totalLoad = Array.from(this.agentLoads.values()).reduce((sum, load) => sum + load, 0);
    const averageLoad = totalLoad / this.agentLoads.size;
    
    this.criticalAgents.clear();
    
    for (const [agentId, load] of this.agentLoads) {
      if (load > averageLoad * CONFIG.criticalAgentThreshold) {
        this.criticalAgents.add(agentId);
      }
    }
  }

  isAgentCritical(agentId) {
    return this.criticalAgents.has(agentId);
  }

  getAgentLoad(agentId) {
    return this.agentLoads.get(agentId) || 0;
  }
}

// Load balancer
nclass LoadBalancer {
  constructor(loadMonitor) {
    this.loadMonitor = loadMonitor;
    this.activeAgents = new Set();
  }

  selectAgent(agentId) {
    // If agent is not critical, use it directly
    if (!this.loadMonitor.isAgentCritical(agentId)) {
      return agentId;
    }
    
    // Find alternative agents with lower load
    const alternatives = Array.from(this.loadMonitor.agentLoads.entries())
      .filter(([id, load]) => 
        id !== agentId && 
        load < this.loadMonitor.getAgentLoad(agentId) * CONFIG.loadBalancingFactor
      );
    
    if (alternatives.length === 0) {
      return agentId; // No better alternative found
    }
    
    // Select agent with the lowest load
    const [selectedAgent] = alternatives.reduce((min, current) => 
      current[1] < min[1] ? current : min
    );
    
    return selectedAgent;
  }

  distributeWork(workload, agentIds) {
    const distribution = {};
    
    for (const agentId of agentIds) {
      const selectedAgent = this.selectAgent(agentId);
      
      if (!distribution[selectedAgent]) {
        distribution[selectedAgent] = [];
      }
      
      distribution[selectedAgent].push(workload);
    }
    
    return distribution;
  }
}

// Recovery system
class RecoverySystem {
  constructor() {
    this.logger = new RecoveryLogger();
    this.loadMonitor = new LoadMonitor();
    this.loadBalancer = new LoadBalancer(this.loadMonitor);
    this.activeAgents = this.loadAgents();
    
    this.logSystemStart();
  }

  loadAgents() {
    const agents = [];
    
    if (existsSync(CONFIG.agentsDirectory)) {
      const agentDirs = require('fs').readdirSync(CONFIG.agentsDirectory, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory());
      
      for (const dirent of agentDirs) {
        const agentId = dirent.name;
        const agentPath = join(CONFIG.agentsDirectory, agentId);
        
        try {
          const manifest = JSON.parse(
            require('fs').readFileSync(join(agentPath, 'tools-manifest.md'), 'utf-8')
          );
          
          agents.push({
            id: agentId,
            path: agentPath,
            manifest,
            status: 'active',
            lastFailure: null,
            recoveryAttempts: 0
          });
          
          // Initialize load monitoring
          this.loadMonitor.updateAgentLoad(agentId, 0);
        } catch (error) {
          this.logger.log({
            type: 'error',
            message: `Failed to load agent ${agentId}: ${error.message}`
          });
        }
      }
    }
    
    return agents;
  }

  logSystemStart() {
    this.logger.log({
      type: 'system-start',
      message: 'Recovery system initialized',
      agentCount: this.activeAgents.length,
      timestamp: new Date().toISOString()
    });
  }

  async recoverAgent(agentId, task) {
    const agent = this.activeAgents.find(a => a.id === agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }
    
    const backoff = new ExponentialBackoff(
      CONFIG.maxRetries,
      CONFIG.initialDelayMs,
      CONFIG.maxDelayMs
    );
    
    while (true) {
      try {
        // Update agent load before execution
        const currentLoad = this.loadMonitor.getAgentLoad(agentId);
        this.loadMonitor.updateAgentLoad(agentId, currentLoad + 1);
        
        // Execute the task
        const result = await this.executeTask(agent, task);
        
        // Reset on success
        agent.lastFailure = null;
        agent.recoveryAttempts = 0;
        backoff.reset();
        
        // Update load after successful execution
        this.loadMonitor.updateAgentLoad(agentId, currentLoad);
        
        this.logger.log({
          type: 'recovery-success',
          agentId,
          task,
          timestamp: new Date().toISOString()
        });
        
        return result;
      } catch (error) {
        agent.lastFailure = error.message;
        agent.recoveryAttempts++;
        
        this.logger.log({
          type: 'recovery-failure',
          agentId,
          task,
          error: error.message,
          attempts: agent.recoveryAttempts,
          timestamp: new Date().toISOString()
        });
        
        if (agent.recoveryAttempts >= CONFIG.maxRetries) {
          this.logger.log({
            type: 'recovery-max-attempts',
            agentId,
            task,
            timestamp: new Date().toISOString()
          });
          
          throw new Error(`Max recovery attempts exceeded for agent ${agentId}`);
        }
        
        // Wait before retry
        const delay = backoff.nextDelay();
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  async executeTask(agent, task) {
    // Simulate task execution
    // In a real implementation, this would call the agent's specific functionality
    
    if (task.type === 'health-check') {
      // Simulate health check
      if (Math.random() > 0.8) {
        throw new Error('Health check failed');
      }
      return { status: 'healthy' };
    } else if (task.type === 'data-processing') {
      // Simulate data processing
      if (Math.random() > 0.7) {
        throw new Error('Data processing failed');
      }
      return { status: 'processed', result: `Processed data for ${task.data}` };
    } else {
      throw new Error(`Unknown task type: ${task.type}`);
    }
  }

  distributeWork(workloads) {
    const agentIds = this.activeAgents.map(a => a.id);
    return this.loadBalancer.distributeWork(workloads, agentIds);
  }

  getSystemStatus() {
    return {
      activeAgents: this.activeAgents.length,
      criticalAgents: Array.from(this.loadMonitor.criticalAgents),
      agentLoads: Object.fromEntries(this.loadMonitor.agentLoads),
      timestamp: new Date().toISOString()
    };
  }
}

// Main execution
async function main() {
  const recoverySystem = new RecoverySystem();
  
  // Example usage
  try {
    // Test agent recovery
    const agentId = 'agent-9-insurance';
    const task = { type: 'health-check' };
    
    const result = await recoverySystem.recoverAgent(agentId, task);
    console.log('Recovery result:', result);
    
    // Test work distribution
    const workloads = [
      { type: 'data-processing', data: 'dataset1' },
      { type: 'data-processing', data: 'dataset2' },
      { type: 'data-processing', data: 'dataset3' }
    ];
    
    const distribution = recoverySystem.distributeWork(workloads);
    console.log('Work distribution:', distribution);
    
    // Get system status
    const status = recoverySystem.getSystemStatus();
    console.log('System status:', status);
    
    // Save status to file
    const statusFile = join(CONFIG.stateDirectory, 'recovery-status.json');
    writeFileSync(statusFile, JSON.stringify(status, null, 2));
    
  } catch (error) {
    console.error('Recovery system error:', error);
    
    recoverySystem.logger.log({
      type: 'system-error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
    
    process.exit(1);
  }
}

// Export for use as module
export { RecoverySystem, RecoveryLogger, ExponentialBackoff, LoadMonitor, LoadBalancer };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
