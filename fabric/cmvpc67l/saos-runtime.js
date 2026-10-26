import { createHash } from 'crypto';
import { setTimeout } from 'timers/promises';

class AgentErrorHandling {
  constructor(agentName, maxRetries = 3, baseDelay = 1000) {
    this.agentName = agentName;
    this.maxRetries = maxRetries;
    this.baseDelay = baseDelay;
    this.failureCount = 0;
    this.recoveryActions = [];
    this.eventLog = [];
  }

  logEvent(eventType, details) {
    const timestamp = new Date().toISOString();
    const event = {
      timestamp,
      agent: this.agentName,
      type: eventType,
      details
    };
    this.eventLog.push(event);
    return event;
  }

  async executeWithRetry(asyncFn, ...args) {
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await asyncFn(...args);
        if (attempt > 0) {
          this.logEvent('recovery', { attempt, message: 'Operation succeeded after retries' });
        }
        this.failureCount = 0;
        return result;
      } catch (error) {
        this.logEvent('failure', { attempt, error: error.message });
        
        if (attempt === this.maxRetries) {
          this.failureCount++;
          await this.executeRecoveryActions(error);
          throw new Error(`Operation failed after ${this.maxRetries} retries: ${error.message}`);
        }
        
        const delay = this.calculateBackoff(attempt);
        await setTimeout(delay);
      }
    }
  }

  calculateBackoff(attempt) {
    const jitter = Math.random() * 0.2;
    const exponentialDelay = Math.pow(2, attempt) * this.baseDelay;
    return Math.floor(exponentialDelay * (1 + jitter));
  }

  addRecoveryAction(actionFn) {
    this.recoveryActions.push(actionFn);
  }

  async executeRecoveryActions(error) {
    this.logEvent('recovery_start', { error: error.message });
    
    for (const action of this.recoveryActions) {
      try {
        await action(error);
        this.logEvent('recovery_action_success', { action: action.name });
      } catch (actionError) {
        this.logEvent('recovery_action_failure', { 
          action: action.name, 
          error: actionError.message 
        });
      }
    }
  }

  getEventLog() {
    return [...this.eventLog];
  }

  getFailureCount() {
    return this.failureCount;
  }
}

export default AgentErrorHandling;