import { loadavg } from 'os';
import { createHash } from '@noble/hashes/sha256';
import { randomBytes } from '@noble/secp256k1';

// Load Balancer with Dynamic Resource Allocation
export class AdaptiveLoadBalancer {
  constructor() {
    this.replicas = [];
    this.helperServers = [];
    this.requestQueue = [];
    this.memoryPressureThreshold = 0.8; // 80% memory usage
    this.requestThreshold = 500; // requests/second
    this.currentLoad = 0;
    this.lastLoadCheck = Date.now();
    this.compressionCache = new Map();
    this.failureRecoveryAttempts = 0;
    this.maxRecoveryAttempts = 3;
    
    // Initialize with some replicas
    this.initializeReplicas(3);
  }

  initializeReplicas(count) {
    for (let i = 0; i < count; i++) {
      this.replicas.push({
        id: `replica-${i}`,
        active: true,
        currentLoad: 0,
        memoryUsage: 0,
        lastHealthCheck: Date.now()
      });
    }
  }

  // 1. Early load detection mechanism
  detectRisingLoad() {
    const now = Date.now();
    const timeDiff = (now - this.lastLoadCheck) / 1000; // in seconds
    
    if (timeDiff >= 1) { // Check every second
      const loadFactor = this.currentLoad / this.requestThreshold;
      const systemLoad = loadavg()[0]; // 1-minute average
      
      if (loadFactor > 0.7 || systemLoad > this.memoryPressureThreshold) {
        console.warn(`High load detected: ${loadFactor.toFixed(2)} system load: ${systemLoad.toFixed(2)}`);
        return true;
      }
      
      this.lastLoadCheck = now;
    }
    
    return false;
  }

  // 2. Dynamic resource allocation to active replicas
  allocateResources() {
    const risingLoad = this.detectRisingLoad();
    
    if (risingLoad) {
      // Add more replicas if needed
      if (this.replicas.filter(r => r.active).length < 10) {
        const newReplica = {
          id: `replica-${this.replicas.length}`,
          active: true,
          currentLoad: 0,
          memoryUsage: 0,
          lastHealthCheck: Date.now()
        };
        this.replicas.push(newReplica);
        console.log(`Added new replica: ${newReplica.id}`);
      }
      
      // Distribute load more evenly
      this.redistributeLoad();
    }
  }

  redistributeLoad() {
    const activeReplicas = this.replicas.filter(r => r.active);
    const totalLoad = activeReplicas.reduce((sum, r) => sum + r.currentLoad, 0);
    
    if (totalLoad === 0) return;
    
    // Find overloaded replicas
    const overloaded = activeReplicas.filter(r => r.currentLoad > this.requestThreshold / activeReplicas.length * 1.5);
    
    if (overloaded.length > 0) {
      const underloaded = activeReplicas.filter(r => r.currentLoad < this.requestThreshold / activeReplicas.length * 0.7);
      
      if (underloaded.length > 0) {
        // Transfer load from overloaded to underloaded
        const transferAmount = Math.min(
          overloaded[0].currentLoad * 0.2, // Transfer 20% of load
          underloaded[0].capacity - underloaded[0].currentLoad
        );
        
        if (transferAmount > 0) {
          overloaded[0].currentLoad -= transferAmount;
          underloaded[0].currentLoad += transferAmount;
          console.log(`Transferred ${transferAmount} requests from ${overloaded[0].id} to ${underloaded[0].id}`);
        }
      }
    }
  }

  // 3. Deploy helper servers for peripheral requests
  deployHelperServers() {
    if (this.detectRisingLoad() && this.helperServers.length < 5) {
      const helperServer = {
        id: `helper-${this.helperServers.length}`,
        active: true,
        currentLoad: 0,
        memoryUsage: 0,
        lastHealthCheck: Date.now()
      };
      this.helperServers.push(helperServer);
      console.log(`Deployed helper server: ${helperServer.id}`);
    }
  }

  // 4. Smart data compression mechanism
  compressData(data) {
    const dataString = JSON.stringify(data);
    const hash = createHash(dataString).toString();
    
    // Check if already compressed
    if (this.compressionCache.has(hash)) {
      return this.compressionCache.get(hash);
    }
    
    // Simple compression logic (in real scenario, use a proper compression library)
    const compressed = {
      data: dataString,
      compressed: btoa(dataString), // Base64 encoding as simple compression
      hash: hash
    };
    
    // Cache the compressed data
    this.compressionCache.set(hash, compressed);
    
    // Limit cache size
    if (this.compressionCache.size > 1000) {
      const firstKey = this.compressionCache.keys().next().value;
      this.compressionCache.delete(firstKey);
    }
    
    return compressed;
  }

  // 5. Fast failure recovery algorithm
  handleFailure(replicaId) {
    const replica = this.replicas.find(r => r.id === replicaId);
    
    if (replica && !replica.active) {
      this.failureRecoveryAttempts++;
      
      if (this.failureRecoveryAttempts <= this.maxRecoveryAttempts) {
        // Try to restart the replica
        replica.active = true;
        replica.currentLoad = 0;
        replica.memoryUsage = 0;
        replica.lastHealthCheck = Date.now();
        
        console.log(`Attempted recovery for ${replicaId}. Attempt ${this.failureRecoveryAttempts}/${this.maxRecoveryAttempts}`);
        
        // Redistribute load
        this.redistributeLoad();
      } else {
        // Max attempts reached, replace the replica
        const index = this.replicas.indexOf(replica);
        this.replicas[index] = {
          id: `replica-${this.replicas.length}`,
          active: true,
          currentLoad: 0,
          memoryUsage: 0,
          lastHealthCheck: Date.now()
        };
        
        console.log(`Replaced failed replica ${replicaId} with new replica`);
        this.failureRecoveryAttempts = 0; // Reset counter
      }
    }
  }

  // Main request handling method
  async handleRequest(request) {
    this.currentLoad++;
    
    // Check for rising load and allocate resources
    this.allocateResources();
    
    // Deploy helper servers if needed
    this.deployHelperServers();
    
    // Find the best replica for this request
    const activeReplicas = this.replicas.filter(r => r.active);
    const bestReplica = activeReplicas.reduce((best, current) => 
      (current.currentLoad < best.currentLoad) ? current : best
    );
    
    // Compress request data if needed
    const compressedRequest = this.detectRisingLoad() ? this.compressData(request) : request;
    
    try {
      // Simulate processing the request
      const response = await this.processRequest(bestReplica, compressedRequest);
      
      // Update replica load
      bestReplica.currentLoad++;
      bestReplica.lastHealthCheck = Date.now();
      
      return response;
    } catch (error) {
      console.error(`Request failed on ${bestReplica.id}:`, error);
      
      // Mark replica as failed
      bestReplica.active = false;
      
      // Attempt recovery
      this.handleFailure(bestReplica.id);
      
      // Retry with another replica
      return this.handleRequest(request);
    } finally {
      this.currentLoad--;
    }
  }

  // Simulate request processing
  async processRequest(replica, request) {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
    
    // Simulate processing time based on load
    const processingTime = 10 + (replica.currentLoad * 2);
    await new Promise(resolve => setTimeout(resolve, processingTime));
    
    // Simulate memory usage
    replica.memoryUsage = Math.random() * 0.9; // 0-90% memory usage
    
    return {
      status: 'success',
      processedBy: replica.id,
      processingTime: processingTime,
      memoryUsage: replica.memoryUsage,
      timestamp: Date.now()
    };
  }

  // Health check for all replicas and helpers
  performHealthChecks() {
    const now = Date.now();
    
    [...this.replicas, ...this.helperServers].forEach(server => {
      if (server.active && (now - server.lastHealthCheck) > 60000) { // 1 minute timeout
        console.warn(`Health check timeout for ${server.id}`);
        server.active = false;
        this.handleFailure(server.id);
      }
    });
  }
}

// Unit Tests
import { describe, it, expect, beforeEach } from 'https://deno.land/std@0.177.0/testing/bdd.ts';

describe('AdaptiveLoadBalancer', () => {
  let loadBalancer;

  beforeEach(() => {
    loadBalancer = new AdaptiveLoadBalancer();
  });

  it('should initialize with replicas', () => {
    expect(loadBalancer.replicas.length).toBe(3);
    expect(loadBalancer.replicas.every(r => r.active)).toBe(true);
  });

  it('should detect rising load', () => {
    // Simulate high load
    for (let i = 0; i < 600; i++) {
      loadBalancer.currentLoad++;
    }
    
    expect(loadBalancer.detectRisingLoad()).toBe(true);
  });

  it('should allocate resources when load is high', () => {
    // Simulate high load
    for (let i = 0; i < 600; i++) {
      loadBalancer.currentLoad++;
    }
    
    const initialReplicaCount = loadBalancer.replicas.length;
    loadBalancer.allocateResources();
    
    expect(loadBalancer.replicas.length).toBeGreaterThan(initialReplicaCount);
  });

  it('should deploy helper servers when needed', () => {
    // Simulate high load
    for (let i = 0; i < 600; i++) {
      loadBalancer.currentLoad++;
    }
    
    const initialHelperCount = loadBalancer.helperServers.length;
    loadBalancer.deployHelperServers();
    
    expect(loadBalancer.helperServers.length).toBeGreaterThan(initialHelperCount);
  });

  it('should compress data when needed', () => {
    const testData = { data: 'test', value: 123 };
    const compressed = loadBalancer.compressData(testData);
    
    expect(compressed).toHaveProperty('data');
    expect(compressed).toHaveProperty('compressed');
    expect(compressed).toHaveProperty('hash');
    expect(compressed.data).toBe(JSON.stringify(testData));
  });

  it('should handle replica failure', () => {
    const replicaId = loadBalancer.replicas[0].id;
    loadBalancer.handleFailure(replicaId);
    
    expect(loadBalancer.replicas[0].active).toBe(false);
    
    // Second attempt should try to recover
    loadBalancer.handleFailure(replicaId);
    expect(loadBalancer.replicas[0].active).toBe(true);
  });

  it('should handle requests and balance load', async () => {
    // Process multiple requests
    const requests = Array.from({ length: 10 }, (_, i) => ({ id: i }));
    const responses = await Promise.all(
      requests.map(req => loadBalancer.handleRequest(req))
    );
    
    expect(responses.length).toBe(10);
    expect(responses.every(r => r.status === 'success')).toBe(true);
    
    // Check that load is distributed
    const loadCounts = loadBalancer.replicas.map(r => r.currentLoad);
    const maxLoad = Math.max(...loadCounts);
    const minLoad = Math.min(...loadCounts);
    
    // Load should be somewhat balanced (difference not too large)
    expect(maxLoad - minLoad).toBeLessThanOrEqual(3);
  });

  it('should perform health checks', () => {
    // Simulate a server that hasn't been checked in a while
    loadBalancer.replicas[0].lastHealthCheck = Date.now() - 120000; // 2 minutes ago
    
    loadBalancer.performHealthChecks();
    
    expect(loadBalancer.replicas[0].active).toBe(false);
  });
});

// Run tests if this file is executed directly
if (import.meta.main) {
  import('https://deno.land/std@0.177.0/testing/bdd.ts').then(({ runTests }) => {
    runTests();
  });
}
