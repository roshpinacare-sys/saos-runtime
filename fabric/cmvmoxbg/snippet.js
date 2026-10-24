// memory-tracker.mjs — Real-time memory tracking & aggressive GC for SAOS parallel engine
// Integrates with existing agent/task runtime (saos-runtime) — no new deps beyond @noble/* already in package.json

import { performance } from 'perf_hooks';
import { createHash } from 'crypto';

// ---- Configuration (tunable via env) ----
const GC_INTERVAL_MS = Number(process.env.SAOS_GC_INTERVAL_MS ?? 30_000);        // 30s default
const LEAK_THRESHOLD_MB = Number(process.env.SAOS_LEAK_THRESHOLD_MB ?? 150);      // per-agent soft limit
const GLOBAL_PRESSURE_MB = Number(process.env.SAOS_GLOBAL_PRESSURE_MB ?? 512);    // process-wide hard limit
const SAMPLE_WINDOW = Number(process.env.SAOS_SAMPLE_WINDOW ?? 10);               // samples for trend

// ---- Internal state ----
const agentMetrics = new Map(); // agentId -> { samples: [], lastGC: 0, taskCount: 0 }
let globalPressureTimer = null;
let gcTimer = null;

// ---- Helpers ----
function mb(bytes) { return Math.round(bytes / 1024 / 1024 * 100) / 100; }
function now() { return performance.now(); }
function hashKey(str) { return createHash('sha256').update(str).digest('hex').slice(0, 16); }

// ---- Core: sample memory for an agent ----
export function sampleAgentMemory(agentId, taskId = 'idle') {
  const mem = process.memoryUsage();
  const sample = {
    ts: Date.now(),
    rss: mb(mem.rss),
    heapUsed: mb(mem.heapUsed),
    heapTotal: mb(mem.heapTotal),
    external: mb(mem.external),
    agentId,
    taskId
  };

  let m = agentMetrics.get(agentId);
  if (!m) {
    m = { samples: [], lastGC: now(), taskCount: 0 };
    agentMetrics.set(agentId, m);
  }
  m.samples.push(sample);
  if (m.samples.length > SAMPLE_WINDOW) m.samples.shift();
  m.taskCount++;

  // Early leak detection: heapUsed growth trend over window
  if (m.samples.length === SAMPLE_WINDOW) {
    const first = m.samples[0].heapUsed;
    const last = m.samples[m.samples.length - 1].heapUsed;
    const growth = last - first;
    if (growth > LEAK_THRESHOLD_MB) {
      reportLeakSuspect(agentId, growth, m.samples);
    }
  }

  // Global pressure check
  if (mem.heapUsed > GLOBAL_PRESSURE_MB * 1024 * 1024) {
    triggerAggressiveGC('global-pressure');
  }

  return sample;
}

// ---- Leak reporting (hooks into management system) ----
function reportLeakSuspect(agentId, growthMb, samples) {
  const payload = {
    kind: 'memory-leak-suspect',
    schema: 1,
    agentId,
    growthMb,
    windowSamples: SAMPLE_WINDOW,
    firstSample: samples[0],
    lastSample: samples[samples.length - 1],
    detectedAt: new Date().toISOString()
  };
  // Emit to stdout (captured by grid-watchdog / operator-triage)
  console.log(JSON.stringify(payload));
  // Also write to state for cross-repo visibility
  import('fs/promises').then(fs => fs.writeFile(
    `state/memory-leak-${hashKey(agentId)}-${Date.now()}.json`,
    JSON.stringify(payload, null, 2)
  ).catch(() => {}));
}

// ---- Aggressive GC trigger ----
export function triggerAggressiveGC(reason = 'manual') {
  const before = process.memoryUsage().heapUsed;
  if (global.gc) {
    global.gc(); // requires --expose-gc flag
  } else {
    // Fallback: allocate pressure to force GC (V8 heuristic)
    const arr = [];
    for (let i = 0; i < 1000; i++) arr.push(new Array(1000).fill(0));
    arr.length = 0;
  }
  const after = process.memoryUsage().heapUsed;
  const freed = mb(before - after);

  const report = {
    kind: 'aggressive-gc',
    schema: 1,
    reason,
    freedMb: freed,
    beforeMb: mb(before),
    afterMb: mb(after),
    at: new Date().toISOString()
  };
  console.log(JSON.stringify(report));
  return report;
}

// ---- Periodic GC scheduler ----
export function startGCScheduler() {
  if (gcTimer) return;
  gcTimer = setInterval(() => {
    triggerAggressiveGC('scheduled');
    // Clean old samples
    for (const [aid, m] of agentMetrics) {
      if (now() - m.lastGC > GC_INTERVAL_MS * 3) {
        m.samples = m.samples.slice(-3);
      }
    }
  }, GC_INTERVAL_MS);
  gcTimer.unref(); // don't keep process alive
}
export function stopGCScheduler() {
  if (gcTimer) { clearInterval(gcTimer); gcTimer = null; }
}

// ---- Integration hooks for agent/task engine ----
export function onTaskStart(agentId, taskId) {
  const m = agentMetrics.get(agentId);
  if (m) m.taskCount++;
  return sampleAgentMemory(agentId, taskId);
}
export function onTaskEnd(agentId, taskId) {
  sampleAgentMemory(agentId, taskId);
  // Optional: micro-GC after heavy tasks
  const mem = process.memoryUsage();
  if (mem.heapUsed > GLOBAL_PRESSURE_MB * 1024 * 1024 * 0.7) {
    triggerAggressiveGC('post-task');
  }
}

// ---- Status snapshot for management dashboard ----
export function getMemoryStatus() {
  const mem = process.memoryUsage();
  const agents = {};
  for (const [aid, m] of agentMetrics) {
    const latest = m.samples[m.samples.length - 1];
    agents[aid] = {
      taskCount: m.taskCount,
      lastSample: latest,
      trendMb: m.samples.length > 1
        ? Math.round((latest.heapUsed - m.samples[0].heapUsed) * 100) / 100
        : 0
    };
  }
  return {
    process: { rss: mb(mem.rss), heapUsed: mb(mem.heapUsed), heapTotal: mb(mem.heapTotal) },
    config: { GC_INTERVAL_MS, LEAK_THRESHOLD_MB, GLOBAL_PRESSURE_MB, SAMPLE_WINDOW },
    agents,
    at: new Date().toISOString()
  };
}

// ---- Auto-start if imported as main module (for standalone testing) ----
if (import.meta.url === `file://${process.argv[1]}`) {
  startGCScheduler();
  console.log(JSON.stringify({ kind: 'memory-tracker-started', pid: process.pid }));
  setTimeout(() => stopGCScheduler(), 60_000);
}

// ---- Exports for integration ----
export default {
  sampleAgentMemory,
  triggerAggressiveGC,
  startGCScheduler,
  stopGCScheduler,
  onTaskStart,
  onTaskEnd,
  getMemoryStatus
};