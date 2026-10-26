import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import { AgentRegistry } from './agents/agent-registry.mjs';
import { ErrorHandler } from './core/error-handler.mjs';
import { RemoteMonitor } from './core/remote-monitor.mjs';

class DistributedPacer extends EventEmitter {
  constructor(options = {}) {
    super();
    this.agentRegistry = new AgentRegistry(options);
    this.errorHandler = new ErrorHandler(options);
    this.remoteMonitor = new RemoteMonitor(options);
    this.config = {
      maxRetries: options.maxRetries || 3,
      recoveryWindow: options.recoveryWindow || 30000, // 30 seconds
      agentTimeout: options.agentTimeout || 5000,
      monitoringInterval: options.monitoringInterval || 10000,
      ...options
    };
    this.state = {
      activeAgents: new Map(),
      failedAgents: new Map(),
      recoveryAttempts: new Map(),
      lastHeartbeat: new Map(),
      isRunning: false
    };
    
    this.startMonitoring();
  }
  
  async start() {
    if (this.state.isRunning) return;
    
    this.state.isRunning = true;
    this.emit('started');
    
    try {
      await this.initializeAgents();
      this.emit('agents-initialized');
    } catch (error) {
      this.errorHandler.handleError(error, 'initialize-agents');
    }
  }
  
  async stop() {
    if (!this.state.isRunning) return;
    
    this.state.isRunning = false;
    this.emit('stopping');
    
    try {
      await this.cleanupAgents();
      this.emit('stopped');
    } catch (error) {
      this.errorHandler.handleError(error, 'cleanup-agents');
    }
  }
  
  async initializeAgents() {
    const agents = await this.agentRegistry.getActiveAgents();
    
    for (const agent of agents) {
      try {
        await this.registerAgent(agent);
      } catch (error) {
        this.errorHandler.handleError(error, `register-agent-${agent.id}`);
      }
    }
  }
  
  async registerAgent(agent) {
    const agentId = agent.id;
    
    if (this.state.failedAgents.has(agentId)) {
      const lastFailure = this.state.failedAgents.get(agentId);
      if (Date.now() - lastFailure.timestamp < this.config.recoveryWindow) {
        throw new Error(`Agent ${agentId} is in recovery window`);
      }
    }
    
    this.state.activeAgents.set(agentId, agent);
    this.state.lastHeartbeat.set(agentId, Date.now());
    
    this.emit('agent-registered', agent);
  }
  
  async unregisterAgent(agentId) {
    this.state.activeAgents.delete(agentId);
    this.state.lastHeartbeat.delete(agentId);
    
    this.emit('agent-unregistered', agentId);
  }
  
  async executeTask(task) {
    const agentId = this.selectAgent(task);
    
    if (!agentId) {
      throw new Error('No suitable agent available for task');
    }
    
    const agent = this.state.activeAgents.get(agentId);
    
    try {
      const result = await this.runTaskWithRetry(agent, task);
      this.emit('task-completed', { agentId, task, result });
      return result;
    } catch (error) {
      await this.handleAgentFailure(agentId, error);
      throw error;
    }
  }
  
  selectAgent(task) {
    const suitableAgents = Array.from(this.state.activeAgents.entries())
      .filter(([_, agent]) => this.isAgentSuitable(agent, task));
    
    if (suitableAgents.length === 0) return null;
    
    // Simple round-robin selection
    const currentIndex = this.currentAgentIndex || 0;
    this.currentAgentIndex = (currentIndex + 1) % suitableAgents.length;
    
    return suitableAgents[currentIndex][0];
  }
  
  isAgentSuitable(agent, task) {
    // Basic suitability check - can be extended
    return agent.capabilities.includes(task.type);
  }
  
  async runTaskWithRetry(agent, task) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        const result = await agent.execute(task);
        this.state.lastHeartbeat.set(agent.id, Date.now());
        return result;
      } catch (error) {
        lastError = error;
        
        if (attempt < this.config.maxRetries) {
          await this.delay(this.config.recoveryWindow / this.config.maxRetries);
        }
      }
    }
    
    throw lastError;
  }
  
  async handleAgentFailure(agentId, error) {
    const agent = this.state.activeAgents.get(agentId);
    
    if (!agent) return;
    
    this.state.activeAgents.delete(agentId);
    
    const failureRecord = {
      timestamp: Date.now(),
      error: error.message,
      stack: error.stack,
      recoveryAttempts: (this.state.recoveryAttempts.get(agentId) || 0) + 1
    };
    
    this.state.failedAgents.set(agentId, failureRecord);
    this.state.recoveryAttempts.set(agentId, failureRecord.recoveryAttempts);
    
    this.emit('agent-failed', { agentId, error, failureRecord });
    
    if (failureRecord.recoveryAttempts < this.config.maxRetries) {
      this.scheduleAgentRecovery(agentId);
    }
  }
  
  scheduleAgentRecovery(agentId) {
    const delay = this.config.recoveryWindow * (this.state.recoveryAttempts.get(agentId) || 1);
    
    setTimeout(async () => {
      try {
        await this.recoverAgent(agentId);
      } catch (error) {
        this.errorHandler.handleError(error, `recover-agent-${agentId}`);
      }
    }, delay);
  }
  
  async recoverAgent(agentId) {
    const agent = await this.agentRegistry.getAgent(agentId);
    
    if (!agent) {
      this.state.failedAgents.delete(agentId);
      this.state.recoveryAttempts.delete(agentId);
      return;
    }
    
    try {
      await agent.reset();
      await this.registerAgent(agent);
      
      this.state.failedAgents.delete(agentId);
      this.state.recoveryAttempts.delete(agentId);
      
      this.emit('agent-recovered', agentId);
    } catch (error) {
      this.errorHandler.handleError(error, `recover-agent-${agentId}`);
    }
  }
  
  startMonitoring() {
    this.monitoringInterval = setInterval(() => {
      this.checkAgentHealth();
    }, this.config.monitoringInterval);
  }
  
  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
  }
  
  async checkAgentHealth() {
    const now = Date.now();
    
    for (const [agentId, agent] of this.state.activeAgents) {
      const lastHeartbeat = this.state.lastHeartbeat.get(agentId) || 0;
      
      if (now - lastHeartbeat > this.config.agentTimeout) {
        try {
          await agent.healthCheck();
          this.state.lastHeartbeat.set(agentId, now);
        } catch (error) {
          await this.handleAgentFailure(agentId, error);
        }
      }
    }
  }
  
  async cleanupAgents() {
    for (const agentId of this.state.activeAgents.keys()) {
      try {
        await this.unregisterAgent(agentId);
      } catch (error) {
        this.errorHandler.handleError(error, `cleanup-agent-${agentId}`);
      }
    }
  }
  
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  getStatus() {
    return {
      activeAgents: this.state.activeAgents.size,
      failedAgents: this.state.failedAgents.size,
      isRunning: this.state.isRunning,
      timestamp: Date.now()
    };
  }
}

export { DistributedPacer };

// Unit tests
import { describe, it, expect, beforeEach, afterEach } from 'https://deno.land/std@0.177.0/testing/bdd.ts';
import { mockAgent } from './test-utils.mjs';

describe('DistributedPacer', () => {
  let pacer;
  
  beforeEach(() => {
    pacer = new DistributedPacer({
      maxRetries: 2,
      recoveryWindow: 1000,
      agentTimeout: 500
    });
  });
  
  afterEach(async () => {
    await pacer.stop();
  });
  
  it('should initialize with default configuration', () => {
    expect(pacer.config.maxRetries).toBe(2);
    expect(pacer.config.recoveryWindow).toBe(1000);
    expect(pacer.config.agentTimeout).toBe(500);
  });
  
  it('should start and stop correctly', async () => {
    await pacer.start();
    expect(pacer.state.isRunning).toBe(true);
    
    await pacer.stop();
    expect(pacer.state.isRunning).toBe(false);
  });
  
  it('should register and unregister agents', async () => {
    const agent = mockAgent('agent-1');
    
    await pacer.registerAgent(agent);
    expect(pacer.state.activeAgents.has('agent-1')).toBe(true);
    
    await pacer.unregisterAgent('agent-1');
    expect(pacer.state.activeAgents.has('agent-1')).toBe(false);
  });
  
  it('should select suitable agents for tasks', () => {
    const agent1 = mockAgent('agent-1', ['compute']);
    const agent2 = mockAgent('agent-2', ['storage']);
    
    pacer.state.activeAgents.set('agent-1', agent1);
    pacer.state.activeAgents.set('agent-2', agent2);
    
    const computeTask = { type: 'compute' };
    const storageTask = { type: 'storage' };
    
    expect(pacer.selectAgent(computeTask)).toBe('agent-1');
    expect(pacer.selectAgent(storageTask)).toBe('agent-2');
  });
  
  it('should handle agent failures and recovery', async () => {
    const agent = mockAgent('agent-1', ['compute']);
    
    await pacer.registerAgent(agent);
    
    // Simulate failure
    pacer.state.activeAgents.delete('agent-1');
    pacer.state.failedAgents.set('agent-1', {
      timestamp: Date.now(),
      error: 'Test error',
      recoveryAttempts: 1
    });
    
    // Schedule recovery
    pacer.scheduleAgentRecovery('agent-1');
    
    // Wait for recovery
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    expect(pacer.state.failedAgents.has('agent-1')).toBe(false);
    expect(pacer.state.activeAgents.has('agent-1')).toBe(true);
  });
  
  it('should execute tasks with retry logic', async () => {
    const agent = mockAgent('agent-1', ['compute']);
    
    // Mock agent to fail first, then succeed
    let callCount = 0;
    agent.execute = async (task) => {
      callCount++;
      if (callCount === 1) {
        throw new Error('First failure');
      }
      return { success: true };
    };
    
    await pacer.registerAgent(agent);
    
    const task = { type: 'compute', data: 'test' };
    const result = await pacer.executeTask(task);
    
    expect(result.success).toBe(true);
    expect(callCount).toBe(2);
  });
  
  it('should provide status information', () => {
    expect(pacer.getStatus()).toEqual({
      activeAgents: 0,
      failedAgents: 0,
      isRunning: false,
      timestamp: expect.any(Number)
    });
  });
});