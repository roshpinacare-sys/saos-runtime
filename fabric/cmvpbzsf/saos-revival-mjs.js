import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

// Constants
const FABRIC_DIR = 'fabric';
const REVIVAL_FILE = join(FABRIC_DIR, 'saos-revival.mjs');
const STATE_DIR = 'state';
const AGENTS_DIR = 'agents';
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000; // 5 seconds
const LOAD_THRESHOLD = 0.75; // 75% CPU threshold
const FUSE_TIMEOUT = 30000; // 30 seconds before triggering recovery

// Agent types that need special revival strategies
const CRITICAL_AGENTS = [
  'agent-9-insurance',
  'organ-guardian',
  'vault-owner',
  'sovereign-builder'
];

// Event logging system
class EventLogger {
  constructor() {
    this.logFile = join(STATE_DIR, 'revival-events.jsonl');
    this.ensureLogDirectory();
  }

  ensureLogDirectory() {
    if (!existsSync(STATE_DIR)) {
      try {
        import { mkdirSync } from 'fs';
        mkdirSync(STATE_DIR, { recursive: true });
      } catch (e) {
        console.error('Failed to create state directory:', e);
      }
    }
  }

  log(event) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      ...event,
      id: this.generateId()
    };
    
    try {
      const line = JSON.stringify(logEntry) + '\n';
      writeFileSync(this.logFile, line, { flag: 'a' });
    } catch (e) {
      console.error('Failed to write to log:', e);
    }
  }

  generateId() {
    return createHash('sha256').update(Date.now().toString()).digest('hex').substring(0, 8);
  }
}

// Load monitoring system
class LoadMonitor {
  constructor() {
    this.currentLoad = 0;
    this.history = [];
    this.logger = new EventLogger();
  }

  measureLoad() {
    // Simulated load measurement - in real implementation would use system metrics
    this.currentLoad = Math.random();
    this.history.push({
      timestamp: Date.now(),
      load: this.currentLoad
    });
    
    // Keep only last 60 measurements
    if (this.history.length > 60) {
      this.history.shift();
    }
    
    return this.currentLoad;
  }

  isOverThreshold() {
    return this.currentLoad > LOAD_THRESHOLD;
  }

  getLoadTrend() {
    if (this.history.length < 2) return 'stable';
    
    const recent = this.history.slice(-10);
    const older = this.history.slice(-20, -10);
    
    const recentAvg = recent.reduce((sum, item) => sum + item.load, 0) / recent.length;
    const olderAvg = older.reduce((sum, item) => sum + item.load, 0) / older.length;
    
    if (recentAvg > olderAvg + 0.1) return 'increasing';
    if (recentAvg < olderAvg - 0.1) return 'decreasing';
    return 'stable';
  }
}

// Dynamic load balancing algorithm
class LoadBalancer {
  constructor(monitor) {
    this.monitor = monitor;
    this.logger = new EventLogger();
  }

  balanceLoad(agents) {
    const strategy = this.determineStrategy();
    
    this.logger.log({
      type: 'load_balancing_decision',
      strategy,
      currentLoad: this.monitor.currentLoad,
      loadTrend: this.monitor.getLoadTrend()
    });
    
    switch (strategy) {
      case 'redistribute':
        return this.redistributeWorkload(agents);
      case 'scale_down':
        return this.scaleDownAgents(agents);
      case 'scale_up':
        return this.scaleUpAgents(agents);
      default:
        return agents;
    }
  }

  determineStrategy() {
    const load = this.monitor.currentLoad;
    const trend = this.monitor.getLoadTrend();
    
    if (load > 0.9) return 'emergency';
    if (load > 0.8 && trend === 'increasing') return 'scale_down';
    if (load > 0.7 && trend === 'increasing') return 'redistribute';
    if (load < 0.3 && trend === 'decreasing') return 'scale_up';
    return 'maintain';
  }

  redistributeWorkload(agents) {
    // Implement work redistribution logic
    const activeAgents = agents.filter(agent => agent.status === 'active');
    const overloaded = activeAgents.filter(agent => agent.load > 0.7);
    
    if (overloaded.length === 0) return agents;
    
    const underloaded = activeAgents.filter(agent => agent.load < 0.4);
    
    if (underloaded.length === 0) return agents;
    
    // Redistribute 30% of work from overloaded to underloaded
    const transferAmount = 0.3;
    
    const updatedAgents = agents.map(agent => {
      if (overloaded.includes(agent)) {
        return {
          ...agent,
          load: Math.max(0.4, agent.load - transferAmount),
          lastAdjusted: Date.now()
        };
      } else if (underloaded.includes(agent)) {
        return {
          ...agent,
          load: Math.min(0.9, agent.load + transferAmount),
          lastAdjusted: Date.now()
        };
      }
      return agent;
    });
    
    this.logger.log({
      type: 'work_redistribution',
      overloadedCount: overloaded.length,
      underloadedCount: underloaded.length,
      transferAmount
    });
    
    return updatedAgents;
  }

  scaleDownAgents(agents) {
    // Implement agent scaling down logic
    const activeAgents = agents.filter(agent => agent.status === 'active');
    const leastCritical = activeAgents
      .filter(agent => !CRITICAL_AGENTS.includes(agent.name))
      .sort((a, b) => a.load - b.load);
    
    if (leastCritical.length === 0) return agents;
    
    const agentToScaleDown = leastCritical[0];
    
    this.logger.log({
      type: 'agent_scale_down',
      agent: agentToScaleDown.name,
      reason: 'high system load'
    });
    
    return agents.map(agent => 
      agent.name === agentToScaleDown.name 
        ? { ...agent, status: 'standby', scaledDownAt: Date.now() } 
        : agent
    );
  }

  scaleUpAgents(agents) {
    // Implement agent scaling up logic
    const standbyAgents = agents.filter(agent => agent.status === 'standby');
    
    if (standbyAgents.length === 0) return agents;
    
    const agentToScaleUp = standbyAgents[0];
    
    this.logger.log({
      type: 'agent_scale_up',
      agent: agentToScaleUp.name,
      reason: 'low system load'
    });
    
    return agents.map(agent => 
      agent.name === agentToScaleUp.name 
        ? { ...agent, status: 'active', scaledUpAt: Date.now() } 
        : agent
    );
  }
}

// Automatic recovery mechanism
class RecoveryMechanism {
  constructor(monitor, logger) {
    this.monitor = monitor;
    this.logger = logger;
    this.recoveryAttempts = new Map();
  }

  async attemptRecovery(agent) {
    const agentKey = `${agent.name}-${agent.instance || 'default'}`;
    
    if (!this.recoveryAttempts.has(agentKey)) {
      this.recoveryAttempts.set(agentKey, 0);
    }
    
    const attempts = this.recoveryAttempts.get(agentKey);
    
    if (attempts >= MAX_RETRIES) {
      this.logger.log({
        type: 'recovery_failed',
        agent: agent.name,
        reason: 'max_retries_exceeded',
        attempts
      });
      return false;
    }
    
    this.logger.log({
      type: 'recovery_attempt',
      agent: agent.name,
      attempt: attempts + 1,
      maxRetries: MAX_RETRIES
    });
    
    try {
      // Implement recovery logic based on agent type
      if (CRITICAL_AGENTS.includes(agent.name)) {
        await this.recoverCriticalAgent(agent);
      } else {
        await this.recoverStandardAgent(agent);
      }
      
      this.recoveryAttempts.set(agentKey, 0);
      
      this.logger.log({
        type: 'recovery_success',
        agent: agent.name,
        attempt: attempts + 1
      });
      
      return true;
    } catch (error) {
      this.recoveryAttempts.set(agentKey, attempts + 1);
      
      this.logger.log({
        type: 'recovery_error',
        agent: agent.name,
        error: error.message,
        attempt: attempts + 1
      });
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return false;
    }
  }

  async recoverCriticalAgent(agent) {
    // Special recovery logic for critical agents
    if (agent.name === 'agent-9-insurance') {
      // Implement agent-9 specific recovery
      await this.executeAgentScript(agent, 'recovery.mjs');
    } else if (agent.name === 'organ-guardian') {
      // Implement organ-guardian specific recovery
      await this.executeAgentScript(agent, 'reset-state.mjs');
    } else {
      // Generic critical agent recovery
      await this.executeAgentScript(agent, 'restart.mjs');
    }
  }

  async recoverStandardAgent(agent) {
    // Standard recovery procedure
    await this.executeAgentScript(agent, 'restart.mjs');
  }

  async executeAgentScript(agent, script) {
    // Simulated script execution
    // In real implementation, would execute actual agent scripts
    const scriptPath = join(AGENTS_DIR, agent.name, script);
    
    this.logger.log({
      type: 'script_execution',
      agent: agent.name,
      script,
      scriptPath
    });
    
    // Simulate execution delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Simulate success/failure
    if (Math.random() > 0.2) { // 80% success rate
      return;
    } else {
      throw new Error('Script execution failed');
    }
  }
}

// Main revival system
class RevivalSystem {
  constructor() {
    this.monitor = new LoadMonitor();
    this.logger = new EventLogger();
    this.loadBalancer = new LoadBalancer(this.monitor);
    this.recovery = new RecoveryMechanism(this.monitor, this.logger);
    this.agents = [];
    this.fuseTimer = null;
    
    this.initializeAgents();
  }

  initializeAgents() {
    // Load agents from system
    // In real implementation, would scan agents directory
    this.agents = [
      { name: 'agent-9-insurance', status: 'active', load: 0.6, instance: 'primary' },
      { name: 'organ-guardian', status: 'active', load: 0.4, instance: 'primary' },
      { name: 'vault-owner', status: 'active', load: 0.7, instance: 'primary' },
      { name: 'sovereign-builder', status: 'active', load: 0.5, instance: 'primary' },
      { name: 'dex-operator', status: 'active', load: 0.3, instance: 'primary' },
      { name: 'pulse-monitor', status: 'standby', load: 0.0, instance: 'secondary' }
    ];
    
    this.logger.log({
      type: 'system_initialization',
      agentsCount: this.agents.length,
      criticalAgents: CRITICAL_AGENTS
    });
  }

  async start() {
    this.logger.log({ type: 'revival_system_start' });
    
    // Main monitoring loop
    const monitoringInterval = setInterval(async () => {
      await this.checkSystemHealth();
    }, 10000); // Check every 10 seconds
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
      this.logger.log({ type: 'revival_system_shutdown' });
      clearInterval(monitoringInterval);
      process.exit(0);
    });
  }

  async checkSystemHealth() {
    const load = this.monitor.measureLoad();
    
    this.logger.log({
      type: 'health_check',
      load,
      threshold: LOAD_THRESHOLD,
      isOverThreshold: this.monitor.isOverThreshold()
    });
    
    // Check if system is overloaded
    if (this.monitor.isOverThreshold()) {
      // Start fuse timer if not already running
      if (!this.fuseTimer) {
        this.startFuseTimer();
      }
      
      // Attempt to balance load
      this.agents = this.loadBalancer.balanceLoad(this.agents);
      
      // Check for unhealthy agents
      const unhealthyAgents = this.agents.filter(agent => 
        agent.status === 'active' && agent.load > 0.9
      );
      
      if (unhealthyAgents.length > 0) {
        this.logger.log({
          type: 'unhealthy_agents_detected',
          count: unhealthyAgents.length
        });
        
        // Attempt recovery for unhealthy agents
        for (const agent of unhealthyAgents) {
          const success = await this.recovery.attemptRecovery(agent);
          if (success) {
            // Update agent status after successful recovery
            agent = { ...agent, load: 0.5 };
          }
        }
      }
    } else {
      // Reset fuse timer if system is healthy
      if (this.fuseTimer) {
        this.clearFuseTimer();
      }
    }
  }

  startFuseTimer() {
    this.logger.log({ type: 'fuse_timer_start' });
    
    this.fuseTimer = setTimeout(() => {
      this.logger.log({ type: 'fuse_triggered' });
      this.handleFuseTrigger();
    }, FUSE_TIMEOUT);
  }

  clearFuseTimer() {
    if (this.fuseTimer) {
      clearTimeout(this.fuseTimer);
      this.fuseTimer = null;
      this.logger.log({ type: 'fuse_timer_cleared' });
    }
  }

  async handleFuseTrigger() {
    // Emergency recovery procedures
    this.logger.log({ type: 'emergency_recovery_start' });
    
    // Try to scale down non-critical agents first
    this.agents = this.loadBalancer.scaleDownAgents(this.agents);
    
    // Attempt recovery for all critical agents
    for (const agent of this.agents) {
      if (CRITICAL_AGENTS.includes(agent.name)) {
        await this.recovery.attemptRecovery(agent);
      }
    }
    
    // Reset fuse timer after handling
    this.clearFuseTimer();
  }

  getSystemStatus() {
    return {
      load: this.monitor.currentLoad,
      agents: this.agents,
      isOverThreshold: this.monitor.isOverThreshold(),
      fuseActive: !!this.fuseTimer,
      recoveryAttempts: Object.fromEntries(this.recovery.recoveryAttempts)
    };
  }
}

// Initialize and start the revival system
const revivalSystem = new RevivalSystem();

// Export for use by other modules
export default {
  start: () => revivalSystem.start(),
  getStatus: () => revivalSystem.getSystemStatus(),
  logger: new EventLogger()
};

// Auto-start if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  revivalSystem.start().catch(console.error);
}
