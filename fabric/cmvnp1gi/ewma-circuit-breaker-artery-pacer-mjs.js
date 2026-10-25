import { createHash } from 'crypto';
import { writeFile, appendFile, mkdir } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const RECEIPTS_DIR = join(__dirname, '..', 'receipts');
const HEALTH_LOG = join(RECEIPTS_DIR, 'health.jsonl');
const MAX_PENDING = 1000;
const EWMA_ALPHA = 0.3;
const FAILURE_THRESHOLD = 3;
const RECOVERY_MS = 30_000;
const HEALTH_EXPORT_INTERVAL_MS = 10_000;

class AgentState {
  constructor(id, endpoint) {
    this.id = id;
    this.endpoint = endpoint;
    this.ewmaLoad = 0;
    this.consecutiveFailures = 0;
    this.totalRequests = 0;
    this.totalFailures = 0;
    this.totalLatencyMs = 0;
    this.queueDepth = 0;
    this.lastResponseTimeMs = 0;
    this.circuitOpenAt = 0;
    this.isHealthy = true;
  }

  get failureRate() {
    return this.totalRequests > 0 ? this.totalFailures / this.totalRequests : 0;
  }

  get avgLatencyMs() {
    return this.totalRequests > 0 ? this.totalLatencyMs / this.totalRequests : 0;
  }

  recordSuccess(latencyMs, queueDepth) {
    this.totalRequests++;
    this.totalLatencyMs += latencyMs;
    this.lastResponseTimeMs = latencyMs;
    this.queueDepth = queueDepth;
    this.consecutiveFailures = 0;
    this.updateEwma(latencyMs, queueDepth);
  }

  recordFailure() {
    this.totalRequests++;
    this.totalFailures++;
    this.consecutiveFailures++;
    this.checkCircuitBreaker();
  }

  updateEwma(latencyMs, queueDepth) {
    const loadSignal = latencyMs + queueDepth * 10;
    this.ewmaLoad = EWMA_ALPHA * loadSignal + (1 - EWMA_ALPHA) * this.ewmaLoad;
  }

  checkCircuitBreaker() {
    if (this.consecutiveFailures >= FAILURE_THRESHOLD || this.lastResponseTimeMs > this.getP99Threshold()) {
      this.isHealthy = false;
      this.circuitOpenAt = Date.now() + RECOVERY_MS;
      console.error(JSON.stringify({ level: 'WARN', event: 'circuit_open', agentId: this.id, consecutiveFailures: this.consecutiveFailures, lastResponseTimeMs: this.lastResponseTimeMs, recoveryAt: new Date(this.circuitOpenAt).toISOString() }));
    }
  }

  getP99Threshold() {
    return this.avgLatencyMs * 3;
  }

  tryRecovery() {
    if (!this.isHealthy && Date.now() >= this.circuitOpenAt) {
      this.isHealthy = true;
      this.consecutiveFailures = 0;
      console.info(JSON.stringify({ level: 'INFO', event: 'circuit_closed', agentId: this.id }));
      return true;
    }
    return false;
  }

  toHealthSnapshot() {
    return {
      agentId: this.id,
      endpoint: this.endpoint,
      ewmaLoad: Number(this.ewmaLoad.toFixed(2)),
      failureRate: Number(this.failureRate.toFixed(4)),
      queueDepth: this.queueDepth,
      avgLatencyMs: Number(this.avgLatencyMs.toFixed(2)),
      consecutiveFailures: this.consecutiveFailures,
      isHealthy: this.isHealthy,
      circuitOpenAt: this.circuitOpenAt > 0 ? new Date(this.circuitOpenAt).toISOString() : null,
      timestamp: new Date().toISOString()
    };
  }
}

class ArteryPacer {
  constructor(agents = []) {
    this.agents = new Map();
    this.pending = [];
    this.requestIdCounter = 0;
    this.healthExportTimer = null;
    this.p99LatencyMs = 0;
    this.latencySamples = [];
    this.maxLatencySamples = 1000;

    for (const agent of agents) {
      this.agents.set(agent.id, new AgentState(agent.id, agent.endpoint));
    }

    this.ensureReceiptsDir();
    this.startHealthExport();
  }

  async ensureReceiptsDir() {
    try {
      await mkdir(RECEIPTS_DIR, { recursive: true });
    } catch (err) {
      console.error(JSON.stringify({ level: 'ERROR', event: 'mkdir_failed', path: RECEIPTS_DIR, error: err.message }));
    }
  }

  startHealthExport() {
    this.healthExportTimer = setInterval(() => this.exportHealthMetrics(), HEALTH_EXPORT_INTERVAL_MS);
    this.healthExportTimer.unref();
  }

  stopHealthExport() {
    if (this.healthExportTimer) {
      clearInterval(this.healthExportTimer);
      this.healthExportTimer = null;
    }
  }

  async exportHealthMetrics() {
    const snapshots = [];
    for (const agent of this.agents.values()) {
      agent.tryRecovery();
      snapshots.push(agent.toHealthSnapshot());
    }
    const payload = { timestamp: new Date().toISOString(), agents: snapshots };
    try {
      await appendFile(HEALTH_LOG, JSON.stringify(payload) + '\n');
    } catch (err) {
      console.error(JSON.stringify({ level: 'ERROR', event: 'health_export_failed', error: err.message }));
    }
  }

  selectAgent() {
    let bestAgent = null;
    let bestLoad = Infinity;

    for (const agent of this.agents.values()) {
      agent.tryRecovery();
      if (agent.isHealthy && agent.ewmaLoad < bestLoad) {
        bestLoad = agent.ewmaLoad;
        bestAgent = agent;
      }
    }

    return bestAgent;
  }

  async enqueue(request, response) {
    if (this.pending.length >= MAX_PENDING) {
      response.writeHead(503, { 'Retry-After': '5', 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Service Unavailable', message: 'Backpressure limit reached', retryAfter: 5 }));
      console.warn(JSON.stringify({ level: 'WARN', event: 'load_shed', pending: this.pending.length, maxPending: MAX_PENDING }));
      return false;
    }

    const requestId = ++this.requestIdCounter;
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      this.pending.push({ requestId, request, response, startTime, resolve, reject });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.pending.length === 0) return;

    const agent = this.selectAgent();
    if (!agent) {
      console.warn(JSON.stringify({ level: 'WARN', event: 'no_healthy_agents', pending: this.pending.length }));
      return;
    }

    const work = this.pending.shift();
    if (!work) return;

    const { requestId, request, response, startTime, resolve, reject } = work;

    try {
      const result = await this.forwardToAgent(agent, request);
      const latencyMs = Date.now() - startTime;
      agent.recordSuccess(latencyMs, this.pending.length);
      this.recordLatencySample(latencyMs);
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(result));
      resolve(result);
    } catch (err) {
      agent.recordFailure();
      response.writeHead(502, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Bad Gateway', message: err.message }));
      reject(err);
    }

    if (this.pending.length > 0) {
      setImmediate(() => this.processQueue());
    }
  }

  async forwardToAgent(agent, request) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const res = await fetch(agent.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!res.ok) {
        throw new Error(`Agent ${agent.id} returned ${res.status}`);
      }

      return await res.json();
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  }

  recordLatencySample(latencyMs) {
    this.latencySamples.push(latencyMs);
    if (this.latencySamples.length > this.maxLatencySamples) {
      this.latencySamples.shift();
    }
    this.updateP99();
  }

  updateP99() {
    if (this.latencySamples.length === 0) return;
    const sorted = [...this.latencySamples].sort((a, b) => a - b);
    const idx = Math.floor(sorted.length * 0.99);
    this.p99LatencyMs = sorted[Math.min(idx, sorted.length - 1)];
  }

  getStatus() {
    const agents = [];
    for (const agent of this.agents.values()) {
      agents.push(agent.toHealthSnapshot());
    }
    return {
      pending: this.pending.length,
      maxPending: MAX_PENDING,
      p99LatencyMs: this.p99LatencyMs,
      agents
    };
  }

  shutdown() {
    this.stopHealthExport();
    for (const work of this.pending) {
      work.response.writeHead(503, { 'Content-Type': 'application/json' });
      work.response.end(JSON.stringify({ error: 'Service Unavailable', message: 'Shutting down' }));
      work.reject(new Error('Shutting down'));
    }
    this.pending = [];
  }
}

const defaultAgents = [
  { id: 'agent-1', endpoint: 'http://localhost:3001' },
  { id: 'agent-2', endpoint: 'http://localhost:3002' },
  { id: 'agent-3', endpoint: 'http://localhost:3003' }
];

const pacer = new ArteryPacer(defaultAgents);

export { ArteryPacer, AgentState, pacer };
export default pacer;
