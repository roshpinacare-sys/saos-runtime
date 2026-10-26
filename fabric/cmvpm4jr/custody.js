import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// Constants
const STATE_DIR = 'state';
const CUSTODY_COORDINATION_FILE = join(STATE_DIR, 'custody-coordination.json');
const MAX_AGENTS = 5;
const BACKOFF_BASE = 1000; // 1 second
const MAX_BACKOFF = 30000; // 30 seconds
const LOAD_CHECK_INTERVAL = 5000; // 5 seconds
const HEARTBEAT_THRESHOLD = 15000; // 15 seconds

// Agent class representing a custody agent
class CustodyAgent {
  constructor(id) {
    this.id = id;
    this.isActive = false;
    this.lastHeartbeat = Date.now();
    this.currentBackoff = BACKOFF_BASE;
    this.loadFactor = 0;
    this.tasksInProgress = 0;
  }

  heartbeat() {
    this.lastHeartbeat = Date.now();
    if (!this.isActive) {
      this.isActive = true;
      console.log(`Agent ${this.id} is now active`);
    }
  }

  updateLoadFactor(load) {
    this.loadFactor = Math.max(0, Math.min(100, load));
  }

  incrementTasks() {
    this.tasksInProgress++;
  }

  decrementTasks() {
    this.tasksInProgress = Math.max(0, this.tasksInProgress - 1);
  }

  isStale() {
    return Date.now() - this.lastHeartbeat > HEARTBEAT_THRESHOLD;
  }

  shouldBackoff() {
    return this.loadFactor > 80 || this.tasksInProgress > 10;
  }

  calculateBackoff() {
    if (this.shouldBackoff()) {
      this.currentBackoff = Math.min(
        this.currentBackoff * 2,
        MAX_BACKOFF
      );
    } else {
      this.currentBackoff = BACKOFF_BASE;
    }
    return this.currentBackoff;
  }
}

// Coordination system class
class CustodyCoordinationSystem {
  constructor() {
    this.agents = [];
    this.coordinatorId = null;
    this.lastCoordinatorElection = Date.now();
    this.electionInterval = 30000; // 30 seconds
    this.initializeAgents();
    this.loadCoordinationState();
    this.startPeriodicTasks();
  }

  initializeAgents() {
    for (let i = 0; i < MAX_AGENTS; i++) {
      this.agents.push(new CustodyAgent(`agent-${i}`));
    }
  }

  loadCoordinationState() {
    try {
      if (existsSync(CUSTODY_COORDINATION_FILE)) {
        const data = JSON.parse(readFileSync(CUSTODY_COORDINATION_FILE, 'utf8'));
        this.coordinatorId = data.coordinatorId;
        
        // Restore agent states
        if (data.agents && data.agents.length === this.agents.length) {
          data.agents.forEach((agentData, index) => {
            this.agents[index].isActive = agentData.isActive;
            this.agents[index].lastHeartbeat = agentData.lastHeartbeat;
            this.agents[index].currentBackoff = agentData.currentBackoff;
            this.agents[index].loadFactor = agentData.loadFactor;
            this.agents[index].tasksInProgress = agentData.tasksInProgress;
          });
        }
      }
    } catch (error) {
      console.error('Error loading coordination state:', error);
    }
  }

  saveCoordinationState() {
    try {
      mkdirSync(STATE_DIR, { recursive: true });
      const data = {
        coordinatorId: this.coordinatorId,
        agents: this.agents.map(agent => ({
          id: agent.id,
          isActive: agent.isActive,
          lastHeartbeat: agent.lastHeartbeat,
          currentBackoff: agent.currentBackoff,
          loadFactor: agent.loadFactor,
          tasksInProgress: agent.tasksInProgress
        }))
      };
      writeFileSync(CUSTODY_COORDINATION_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Error saving coordination state:', error);
    }
  }

  startPeriodicTasks() {
    // Periodic load checking and backoff adjustment
    setInterval(() => {
      this.checkSystemLoad();
      this.electCoordinator();
      this.recoverStaleAgents();
      this.saveCoordinationState();
    }, LOAD_CHECK_INTERVAL);
  }

  checkSystemLoad() {
    const activeAgents = this.agents.filter(agent => agent.isActive && !agent.isStale());
    const totalLoad = activeAgents.reduce((sum, agent) => sum + agent.loadFactor, 0);
    const avgLoad = activeAgents.length > 0 ? totalLoad / activeAgents.length : 0;
    
    console.log(`System load: ${avgLoad.toFixed(2)}% (${activeAgents.length}/${MAX_AGENTS} active agents)`);
    
    if (avgLoad > 70) {
      console.warn('High system load detected, implementing backoff strategy');
      this.implementBackoffStrategy();
    }
  }

  implementBackoffStrategy() {
    this.agents.forEach(agent => {
      if (agent.isActive && !agent.isStale()) {
        const backoff = agent.calculateBackoff();
        console.log(`Agent ${agent.id} backing off for ${backoff}ms (load: ${agent.loadFactor}%, tasks: ${agent.tasksInProgress})`);
        
        // In a real implementation, this would trigger actual backoff
        // For this example, we're just logging
      }
    });
  }

  electCoordinator() {
    if (Date.now() - this.lastCoordinatorElection > this.electionInterval) {
      const activeAgents = this.agents.filter(agent => agent.isActive && !agent.isStale());
      
      if (activeAgents.length > 0) {
        // Select agent with lowest load factor as coordinator
        activeAgents.sort((a, b) => a.loadFactor - b.loadFactor);
        const newCoordinator = activeAgents[0];
        
        if (this.coordinatorId !== newCoordinator.id) {
          console.log(`Coordinator elected: ${newCoordinator.id} (load: ${newCoordinator.loadFactor}%)`);
          this.coordinatorId = newCoordinator.id;
          this.lastCoordinatorElection = Date.now();
        }
      } else {
        console.warn('No active agents available for coordinator role');
        this.coordinatorId = null;
      }
    }
  }

  recoverStaleAgents() {
    this.agents.forEach(agent => {
      if (agent.isActive && agent.isStale()) {
        console.log(`Agent ${agent.id} is stale, marking as inactive`);
        agent.isActive = false;
        agent.currentBackoff = BACKOFF_BASE;
      }
    });
  }

  // Simulate agent heartbeat
  simulateHeartbeat(agentId) {
    const agent = this.agents.find(a => a.id === agentId);
    if (agent) {
      agent.heartbeat();
      return true;
    }
    return false;
  }

  // Simulate updating agent load
  simulateLoadUpdate(agentId, load) {
    const agent = this.agents.find(a => a.id === agentId);
    if (agent) {
      agent.updateLoadFactor(load);
      return true;
    }
    return false;
  }

  // Simulate task start
  simulateTaskStart(agentId) {
    const agent = this.agents.find(a => a.id === agentId);
    if (agent) {
      agent.incrementTasks();
      return true;
    }
    return false;
  }

  // Simulate task completion
  simulateTaskCompletion(agentId) {
    const agent = this.agents.find(a => a.id === agentId);
    if (agent) {
      agent.decrementTasks();
      return true;
    }
    return false;
  }

  // Get system status
  getSystemStatus() {
    const activeAgents = this.agents.filter(agent => agent.isActive && !agent.isStale());
    const totalLoad = activeAgents.reduce((sum, agent) => sum + agent.loadFactor, 0);
    const avgLoad = activeAgents.length > 0 ? totalLoad / activeAgents.length : 0;
    
    return {
      coordinatorId: this.coordinatorId,
      activeAgents: activeAgents.length,
      totalAgents: this.agents.length,
      averageLoad: avgLoad.toFixed(2),
      agents: this.agents.map(agent => ({
        id: agent.id,
        isActive: agent.isActive,
        loadFactor: agent.loadFactor,
        tasksInProgress: agent.tasksInProgress,
        isStale: agent.isStale(),
        backoff: agent.currentBackoff
      }))
    };
  }
}

// Initialize the coordination system
const coordinationSystem = new CustodyCoordinationSystem();

// Example usage - in a real system this would be called by agent processes
console.log('Custody coordination system initialized');

// Simulate some activity
setInterval(() => {
  // Randomly update agent loads
  const randomAgent = coordinationSystem.agents[Math.floor(Math.random() * coordinationSystem.agents.length)];
  const randomLoad = Math.floor(Math.random() * 100);
  coordinationSystem.simulateLoadUpdate(randomAgent.id, randomLoad);
  
  // Randomly simulate task start/completion
  if (Math.random() > 0.7) {
    coordinationSystem.simulateTaskStart(randomAgent.id);
  }
  
  if (Math.random() > 0.8 && randomAgent.tasksInProgress > 0) {
    coordinationSystem.simulateTaskCompletion(randomAgent.id);
  }
  
  // Log system status
  const status = coordinationSystem.getSystemStatus();
  console.log(`System status - Coordinator: ${status.coordinatorId}, Active: ${status.activeAgents}/${status.totalAgents}, Avg Load: ${status.averageLoad}%`);
}, 10000);

// Export for use in other modules
export { CustodyCoordinationSystem, CustodyAgent };
