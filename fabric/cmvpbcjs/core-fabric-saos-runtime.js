// core/artery-pacer.mjs

/**
 * Artery Pacer — SAOS runtime circuit breaker and pacing engine
 * Migrated from legacy engine/artery-pacer.mjs to fabric/core/
 * Maintains: heartbeat, circuit breaking, rate limiting, and grid health coordination
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// Constants from engine spec
const GRID_PULSE_INTERVAL = 1200000; // 20min
const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_COOLDOWN = 900000; // 15min
const STATE_PATH = './state/grid-status.json';

/**
 * Core engine logic for SAOS runtime
 * Manages grid pulse, circuit breaking, and pacing decisions
 */
export class ArteryPacer {
  constructor() {
    this.state = this.loadState();
    this.circuitBreaker = {
      failures: 0,
      lastFailure: null,
      isOpen: false
    };
    this.pulseTimer = null;
  }

  /**
   * Load or initialize grid state
   */
  loadState() {
    try {
      if (existsSync(STATE_PATH)) {
        return JSON.parse(readFileSync(STATE_PATH, 'utf8'));
      }
    } catch (e) {
      console.warn('State load failed, initializing', e.message);
    }
    return {
      lastPulse: null,
      pulseCount: 0,
      health: 'GREEN',
      lastCircuitBreak: null,
      signals: {}
    };
  }

  /**
   * Save grid state
   */
  saveState() {
    try {
      const dir = join(STATE_PATH, '..');
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(STATE_PATH, JSON.stringify(this.state, null, 2));
    } catch (e) {
      console.error('State save failed', e.message);
    }
  }

  /**
   * Main pulse entry point — called by runtime scheduler
   */
  async pulse() {
    const now = new Date().toISOString();
    
    // Circuit breaker check
    if (this.circuitBreaker.isOpen) {
      if (now - this.circuitBreaker.lastFailure < CIRCUIT_BREAKER_COOLDOWN) {
        return { verdict: 'CIRCUIT-BREAKER-OPEN', reason: 'Cooldown active' };
      }
      this.circuitBreaker.isOpen = false;
    }

    try {
      // Execute grid health checks
      const healthReport = await this.checkGridHealth();
      
      // Update state
      this.state.lastPulse = now;
      this.state.pulseCount++;
      this.state.signals.pulse = {
        status: 'success',
        timestamp: now,
        health: healthReport
      };
      
      this.saveState();
      return { verdict: 'PULSE-SUCCESS', health: healthReport };
    } catch (error) {
      this.handlePulseFailure(error);
      return { verdict: 'PULSE-FAILURE', error: error.message };
    }
  }

  /**
   * Check grid health signals
   */
  async checkGridHealth() {
    const signals = {};
    
    // Check heartbeat freshness
    signals.heartbeat = await this.checkHeartbeat();
    
    // Check custody coverage
    signals.custody = await this.checkCustody();
    
    // Overall verdict
    const allGreen = Object.values(signals).every(s => s.status === 'GREEN');
    
    return {
      overall: allGreen ? 'GREEN' : 'RED',
      signals
    };
  }

  /**
   * Check heartbeat signal
   */
  async checkHeartbeat() {
    try {
      const heartbeatPath = './state/beat/ci-last-heartbeat.json';
      if (!existsSync(heartbeatPath)) {
        return { status: 'RED', reason: 'Missing heartbeat file' };
      }
      
      const data = JSON.parse(readFileSync(heartbeatPath, 'utf8'));
      const age = Date.now() - new Date(data.timestamp).getTime();
      
      if (age > 5400000) { // 90 minutes
        return { status: 'RED', reason: 'Heartbeat too old', age };
      }
      
      return { status: 'GREEN', age };
    } catch (e) {
      return { status: 'RED', reason: 'Heartbeat check failed', error: e.message };
    }
  }

  /**
   * Check custody coverage
   */
  async checkCustody() {
    try {
      const verdictPath = './hive-custody-verdict.json';
      if (!existsSync(verdictPath)) {
        return { status: 'RED', reason: 'Missing custody verdict' };
      }
      
      const verdict = JSON.parse(readFileSync(verdictPath, 'utf8'));
      return {
        status: verdict.approved ? 'GREEN' : 'RED',
        approved: verdict.approved,
        seeds: verdict.judgment.seeds,
        liveHits: verdict.judgment.liveHits
      };
    } catch (e) {
      return { status: 'RED', reason: 'Custody check failed', error: e.message };
    }
  }

  /**
   * Handle pulse failure and update circuit breaker
   */
  handlePulseFailure(error) {
    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailure = new Date().toISOString();
    
    if (this.circuitBreaker.failures >= CIRCUIT_BREAKER_THRESHOLD) {
      this.circuitBreaker.isOpen = true;
      this.state.lastCircuitBreak = this.circuitBreaker.lastFailure;
    }
    
    this.state.signals.pulse = {
      status: 'failure',
      timestamp: new Date().toISOString(),
      error: error.message,
      circuitBreaker: this.circuitBreaker
    };
    
    this.saveState();
    console.error('Pulse failed:', error.message);
  }

  /**
   * Get current engine status
   */
  getStatus() {
    return {
      state: this.state,
      circuitBreaker: this.circuitBreaker,
      lastPulse: this.state.lastPulse,
      pulseCount: this.state.pulseCount
    };
  }
}

// Export singleton instance for runtime
export const arteryPacer = new ArteryPacer();

// Runtime entry point (when run directly)
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    const result = await arteryPacer.pulse();
    console.log('Pulse result:', result);
    process.exit(result.verdict === 'PULSE-SUCCESS' ? 0 : 1);
  })();
}
