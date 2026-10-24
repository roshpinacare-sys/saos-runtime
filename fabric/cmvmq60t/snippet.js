import { createHash } from 'crypto';
import { EventEmitter } from 'events';

/**
 * Autonomous Garbage Collector for SAOS Parallel Engine
 * Implements background collection, leak detection, proactive compaction
 */
export class AutonomousGC extends EventEmitter {
  constructor(options = {}) {
    super();
    this.threshold = options.threshold || 0.85;
    this.checkInterval = options.checkInterval || 30000;
    this.heapSnapshots = new Map();
    this.leakCandidates = new Map();
    this.collectionStats = {
      collections: 0,
      freedBytes: 0,
      compactions: 0,
      leaksDetected: 0,
      lastCollection: null
    };
    this.monitoring = false;
    this.intervalId = null;
  }

  /**
   * Start autonomous monitoring
   */
  start() {
    if (this.monitoring) return;
    this.monitoring = true;
    this.intervalId = setInterval(() => this.checkAndCollect(), this.checkInterval);
    this.emit('started', { threshold: this.threshold, interval: this.checkInterval });
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.monitoring = false;
    this.emit('stopped', this.getStats());
  }

  /**
   * Core check-and-collect cycle
   */
  async checkAndCollect() {
    const mem = process.memoryUsage();
    const heapUsedRatio = mem.heapUsed / mem.heapTotal;
    
    // Record snapshot for leak detection
    this.recordSnapshot(mem);
    
    // Detect potential leaks
    const leaks = this.detectLeaks();
    if (leaks.length > 0) {
      this.collectionStats.leaksDetected += leaks.length;
      this.emit('leaksDetected', leaks);
    }
    
    // Proactive compaction if threshold exceeded
    if (heapUsedRatio >= this.threshold) {
      await this.compactMemory();
    }
    
    // Regular collection if significant allocation
    if (mem.heapUsed > this.getBaselineHeap() * 1.5) {
      this.forceCollection();
    }
  }

  /**
   * Record heap snapshot for trend analysis
   */
  recordSnapshot(mem) {
    const key = `${mem.heapTotal}-${Math.floor(mem.heapUsed / 1024 / 1024)}`;
    const now = Date.now();
    
    if (!this.heapSnapshots.has(key)) {
      this.heapSnapshots.set(key, { count: 0, firstSeen: now, lastSeen: now });
    }
    const snap = this.heapSnapshots.get(key);
    snap.count++;
    snap.lastSeen = now;
    
    // Clean old snapshots (>1 hour)
    for (const [k, v] of this.heapSnapshots) {
      if (now - v.lastSeen > 3600000) this.heapSnapshots.delete(k);
    }
  }

  /**
   * Detect memory leaks by analyzing allocation patterns
   */
  detectLeaks() {
    const leaks = [];
    const now = Date.now();
    
    for (const [key, snap] of this.heapSnapshots) {
      const duration = now - snap.firstSeen;
      // Persistent allocation growing over 10 minutes
      if (duration > 600000 && snap.count > 20) {
        const [heapTotal, heapUsedMB] = key.split('-').map(Number);
        leaks.push({
          pattern: key,
          heapTotalMB: heapTotal / 1024 / 1024,
          heapUsedMB,
          occurrences: snap.count,
          durationMinutes: Math.round(duration / 60000),
          severity: snap.count > 50 ? 'high' : 'medium',
          recommendation: 'Review object retention in long-running tasks; check for unclosed handles or growing caches'
        });
        this.leakCandidates.set(key, { ...snap, reported: true });
      }
    }
    return leaks;
  }

  /**
   * Proactive memory compaction
   */
  async compactMemory() {
    const before = process.memoryUsage().heapUsed;
    
    // Force V8 garbage collection if exposed
    if (global.gc) {
      global.gc();
    }
    
    // Clear internal caches
    this.clearInternalCaches();
    
    // Wait for event loop tick
    await new Promise(resolve => setImmediate(resolve));
    
    const after = process.memoryUsage().heapUsed;
    const freed = before - after;
    
    this.collectionStats.compactions++;
    this.collectionStats.freedBytes += freed;
    this.collectionStats.lastCollection = new Date().toISOString();
    
    this.emit('compaction', {
      beforeMB: Math.round(before / 1024 / 1024),
      afterMB: Math.round(after / 1024 / 1024),
      freedMB: Math.round(freed / 1024 / 1024),
      timestamp: this.collectionStats.lastCollection
    });
  }

  /**
   * Force garbage collection
   */
  forceCollection() {
    if (global.gc) {
      const before = process.memoryUsage().heapUsed;
      global.gc();
      const after = process.memoryUsage().heapUsed;
      const freed = before - after;
      
      this.collectionStats.collections++;
      this.collectionStats.freedBytes += Math.max(0, freed);
      this.collectionStats.lastCollection = new Date().toISOString();
      
      this.emit('collection', {
        freedMB: Math.round(Math.max(0, freed) / 1024 / 1024),
        timestamp: this.collectionStats.lastCollection
      });
    }
  }

  /**
   * Clear internal tracking caches
   */
  clearInternalCaches() {
    const now = Date.now();
    for (const [key, snap] of this.leakCandidates) {
      if (now - snap.lastSeen > 300000) this.leakCandidates.delete(key);
    }
  }

  /**
   * Get baseline heap from earliest snapshot
   */
  getBaselineHeap() {
    let minHeap = Infinity;
    for (const [key] of this.heapSnapshots) {
      const heapTotal = Number(key.split('-')[0]);
      if (heapTotal < minHeap) minHeap = heapTotal;
    }
    return minHeap === Infinity ? 50 * 1024 * 1024 : minHeap;
  }

  /**
   * Get current statistics
   */
  getStats() {
    const mem = process.memoryUsage();
    return {
      ...this.collectionStats,
      currentHeapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
      currentHeapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
      heapUsedRatio: mem.heapUsed / mem.heapTotal,
      threshold: this.threshold,
      monitoring: this.monitoring,
      snapshotsTracked: this.heapSnapshots.size,
      leakCandidates: this.leakCandidates.size
    };
  }

  /**
   * Generate leak report with recommendations
   */
  generateLeakReport() {
    const leaks = this.detectLeaks();
    const stats = this.getStats();
    return {
      timestamp: new Date().toISOString(),
      summary: {
        totalLeaks: leaks.length,
        highSeverity: leaks.filter(l => l.severity === 'high').length,
        monitoringDurationMinutes: Math.round((Date.now() - (this.startTime || Date.now())) / 60000)
      },
      leaks,
      stats,
      recommendations: leaks.length > 0 ? [
        'Enable --expose-gc flag for forced collection',
        'Review long-running async operations for proper cleanup',
        'Implement object pooling for frequent allocations',
        'Check event listener cleanup in parallel workers',
        'Monitor external library memory behavior'
      ] : ['No leaks detected; memory patterns healthy']
    };
  }
}

/**
 * Load test utility for validating GC under pressure
 */
export async function runLoadTest(gc, options = {}) {
  const { duration = 60000, allocationRate = 1000, objectSize = 1024 } = options;
  const workers = [];
  const startTime = Date.now();
  
  function allocatePressure() {
    const arr = [];
    for (let i = 0; i < allocationRate; i++) {
      arr.push(Buffer.alloc(objectSize).fill('x'));
    }
    // Create some persistent references to simulate leaks
    if (Math.random() < 0.1) {
      workers.push(arr);
    }
    return arr;
  }

  const pressureInterval = setInterval(allocatePressure, 100);
  
  await new Promise(resolve => setTimeout(resolve, duration));
  clearInterval(pressureInterval);
  
  // Cleanup test allocations
  workers.length = 0;
  if (global.gc) global.gc();
  
  return gc.generateLeakReport();
}

// Auto-start if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const gc = new AutonomousGC({ threshold: 0.85, checkInterval: 10000 });
  gc.on('leaksDetected', leaks => console.error('LEAKS:', JSON.stringify(leaks, null, 2)));
  gc.on('compaction', c => console.log('COMPACTION:', JSON.stringify(c)));
  gc.start();
  
  console.log('Starting load test...');
  const report = await runLoadTest(gc, { duration: 30000 });
  console.log('LOAD TEST REPORT:', JSON.stringify(report, null, 2));
  
  gc.stop();
}