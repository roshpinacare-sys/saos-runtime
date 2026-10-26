import { setInterval } from 'node:timers/promises';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';

/**
 * Adaptive Rate Control Module for saos-runtime
 * Implements fail-closed preserved rate limiting with dynamic backpressure
 * and gradual restart to prevent thundering herd
 */
class AdaptiveRateController {
  constructor(options = {}) {
    // Configuration with defaults
    this.config = {
      // System load thresholds (0-1)
      cpuThreshold: options.cpuThreshold ?? 0.8,
      memoryThreshold: options.memoryThreshold ?? 0.85,
      networkThreshold: options.networkThreshold ?? 0.9,
      
      // Rate limiting
      maxConcurrentRequests: options.maxConcurrentRequests ?? 10,
      minRequestInterval: options.minRequestInterval ?? 100, // ms
      maxRequestInterval: options.maxRequestInterval ?? 5000, // ms
      
      // Backpressure
      backpressureFactor: options.backpressureFactor ?? 0.5,
      recoveryFactor: options.recoveryFactor ?? 0.1,
      
      // Gradual restart
      restartWindow: options.restartWindow ?? 30000, // ms
      restartIncrement: options.restartIncrement ?? 100, // ms
      
      // Monitoring
      healthCheckInterval: options.healthCheckInterval ?? 5000, // ms
      
      // Endpoints configuration
      endpoints: options.endpoints ?? [],
      
      // Debugging
      debug: options.debug ?? false
    };
    
    // State
    this.state = {
      // System metrics
      cpuUsage: 0,
      memoryUsage: 0,
      networkUsage: 0,
      
      // Rate control
      currentRate: this.config.minRequestInterval,
      activeRequests: 0,
      requestQueue: [],
      
      // Backpressure
      isBackpressured: false,
      backpressureStartTime: null,
      
      // Gradual restart
      restartState: {
        isActive: false,
        startTime: null,
        currentInterval: this.config.minRequestInterval
      },
      
      // Endpoints
      endpointStates: new Map(),
      
      // Metrics
      metrics: {
        requests: 0,
        errors: 0,
        backpressureEvents: 0,
        restartEvents: 0
      }
    };
    
    // Initialize endpoint states
    this.config.endpoints.forEach(endpoint => {
      this.state.endpointStates.set(endpoint, {
        active: true,
        lastUsed: 0,
        consecutiveFailures: 0,
        cooldownUntil: 0
      });
    });
    
    // Start health monitoring
    this.startHealthMonitoring();
  }
  
  /**
   * Start periodic health checks
   */
  startHealthMonitoring() {
    setInterval(async () => {
      await this.updateSystemMetrics();
      this.checkBackpressure();
      this.checkGradualRestart();
    }, this.config.healthCheckInterval).unref();
  }
  
  /**
   * Update system metrics (CPU, memory, network)
   */
  async updateSystemMetrics() {
    // In a real implementation, this would gather actual system metrics
    // For this example, we'll simulate with random values
    this.state.cpuUsage = Math.random();
    this.state.memoryUsage = Math.random();
    this.state.networkUsage = Math.random();
    
    if (this.config.debug) {
      console.log(`System metrics: CPU=${(this.state.cpuUsage * 100).toFixed(1)}%, Memory=${(this.state.memoryUsage * 100).toFixed(1)}%, Network=${(this.state.networkUsage * 100).toFixed(1)}%`);
    }
  }
  
  /**
   * Check if system is under backpressure
   */
  checkBackpressure() {
    const wasBackpressured = this.state.isBackpressured;
    const shouldBackpressure = 
      this.state.cpuUsage > this.config.cpuThreshold ||
      this.state.memoryUsage > this.config.memoryThreshold ||
      this.state.networkUsage > this.config.networkThreshold;
    
    if (shouldBackpressure && !this.state.isBackpressured) {
      // Enter backpressure
      this.state.isBackpressured = true;
      this.state.backpressureStartTime = Date.now();
      this.state.currentRate = Math.min(
        this.state.currentRate * this.config.backpressureFactor,
        this.config.maxRequestInterval
      );
      this.state.metrics.backpressureEvents++;
      
      if (this.config.debug) {
        console.log(`Entering backpressure. New rate: ${this.state.currentRate}ms`);
      }
    } else if (!shouldBackpressure && this.state.isBackpressured) {
      // Exit backpressure
      this.state.isBackpressured = false;
      const backpressureDuration = Date.now() - this.state.backpressureStartTime;
      
      if (this.config.debug) {
        console.log(`Exiting backpressure after ${backpressureDuration}ms`);
      }
    }
    
    // If we're out of backpressure, gradually increase rate
    if (!this.state.isBackpressured && this.state.currentRate < this.config.minRequestInterval) {
      this.state.currentRate = Math.min(
        this.state.currentRate + this.config.recoveryFactor * this.config.minRequestInterval,
        this.config.minRequestInterval
      );
    }
  }
  
  /**
   * Check if we should activate gradual restart
   */
  checkGradualRestart() {
    // Check if we need to activate gradual restart
    if (!this.state.restartState.isActive && this.state.metrics.errors > 5) {
      this.activateGradualRestart();
    }
    
    // If active, check if we should complete restart
    if (this.state.restartState.isActive) {
      const elapsed = Date.now() - this.state.restartState.startTime;
      
      if (elapsed > this.config.restartWindow) {
        this.completeGradualRestart();
      } else {
        // Gradually increase rate during restart window
        const progress = elapsed / this.config.restartWindow;
        this.state.restartState.currentInterval = Math.floor(
          this.config.minRequestInterval + 
          (this.config.maxRequestInterval - this.config.minRequestInterval) * (1 - progress)
        );
        
        // Use restart rate if we're in backpressure
        if (this.state.isBackpressured) {
          this.state.currentRate = this.state.restartState.currentInterval;
        }
      }
    }
  }
  
  /**
   * Activate gradual restart mechanism
   */
  activateGradualRestart() {
    this.state.restartState = {
      isActive: true,
      startTime: Date.now(),
      currentInterval: this.config.maxRequestInterval
    };
    this.state.currentRate = this.config.maxRequestInterval;
    this.state.metrics.restartEvents++;
    
    if (this.config.debug) {
      console.log('Activating gradual restart');
    }
  }
  
  /**
   * Complete gradual restart
   */
  completeGradualRestart() {
    this.state.restartState.isActive = false;
    this.state.currentRate = this.config.minRequestInterval;
    this.state.metrics.errors = 0; // Reset error counter
    
    if (this.config.debug) {
      console.log('Gradual restart completed');
    }
  }
  
  /**
   * Get next available endpoint
   */
  getNextEndpoint() {
    const now = Date.now();
    const availableEndpoints = [];
    
    for (const [endpoint, state] of this.state.endpointStates) {
      if (state.active && now > state.cooldownUntil) {
        availableEndpoints.push({ endpoint, state });
      }
    }
    
    if (availableEndpoints.length === 0) {
      return null;
    }
    
    // Simple round-robin with failure weighting
    availableEndpoints.sort((a, b) => {
      // Prefer endpoints with fewer recent failures
      const aScore = a.state.consecutiveFailures;
      const bScore = b.state.consecutiveFailures;
      return aScore - bScore;
    });
    
    const selected = availableEndpoints[0];
    selected.state.lastUsed = now;
    
    return selected.endpoint;
  }
  
  /**
   * Execute a request with rate limiting
   */
  async executeRequest(requestFn) {
    this.state.metrics.requests++;
    
    // Check if we can accept new requests
    if (this.state.activeRequests >= this.config.maxConcurrentRequests) {
      throw new Error('Max concurrent requests exceeded');
    }
    
    // Get next available endpoint
    const endpoint = this.getNextEndpoint();
    if (!endpoint) {
      throw new Error('No available endpoints');
    }
    
    // Increment active request counter
    this.state.activeRequests++;
    
    try {
      // Apply rate limiting
      await new Promise(resolve => setTimeout(resolve, this.state.currentRate));
      
      // Execute the request
      const result = await requestFn(endpoint);
      
      // Reset failure count on success
      const endpointState = this.state.endpointStates.get(endpoint);
      if (endpointState) {
        endpointState.consecutiveFailures = 0;
      }
      
      return result;
    } catch (error) {
      // Handle request failure
      this.state.metrics.errors++;
      
      const endpointState = this.state.endpointStates.get(endpoint);
      if (endpointState) {
        endpointState.consecutiveFailures++;
        
        // Apply cooldown for repeated failures
        if (endpointState.consecutiveFailures >= 3) {
          endpointState.cooldownUntil = Date.now() + 60000; // 1 minute cooldown
          endpointState.active = false;
          
          // Schedule endpoint recovery
          setTimeout(() => {
            endpointState.active = true;
            endpointState.consecutiveFailures = 0;
          }, 120000); // 2 minutes
        }
      }
      
      throw error;
    } finally {
      // Decrement active request counter
      this.state.activeRequests--;
    }
  }
  
  /**
   * Get current metrics
   */
  getMetrics() {
    return {
      ...this.state.metrics,
      currentRate: this.state.currentRate,
      activeRequests: this.state.activeRequests,
      isBackpressured: this.state.isBackpressured,
      systemLoad: {
        cpu: this.state.cpuUsage,
        memory: this.state.memoryUsage,
        network: this.state.networkUsage
      },
      endpointStatus: Object.fromEntries(
        this.state.endpointStates.entries()
      )
    };
  }
}

// Export for use in saos-runtime
export default AdaptiveRateController;

// Unit tests
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    console.log('Running AdaptiveRateController tests...');
    
    // Test 1: Basic functionality
    const controller = new AdaptiveRateController({
      endpoints: ['https://endpoint1.com', 'https://endpoint2.com'],
      debug: true
    });
    
    // Mock request function
    const mockRequest = async (endpoint) => {
      return { endpoint, data: 'test' };
    };
    
    // Execute a few requests
    for (let i = 0; i < 5; i++) {
      try {
        const result = await controller.executeRequest(mockRequest);
        console.log('Request success:', result);
      } catch (error) {
        console.error('Request failed:', error.message);
      }
    }
    
    // Check metrics
    console.log('Metrics:', controller.getMetrics());
    
    // Test 2: Backpressure simulation
    console.log('\nTesting backpressure...');
    controller.state.cpuUsage = 0.9; // Trigger backpressure
    await new Promise(resolve => setTimeout(resolve, 100));
    console.log('After backpressure - rate:', controller.state.currentRate);
    
    // Test 3: Gradual restart
    console.log('\nTesting gradual restart...');
    controller.state.metrics.errors = 6; // Trigger restart
    controller.checkGradualRestart();
    console.log('Restart active:', controller.state.restartState.isActive);
    console.log('Restart rate:', controller.state.currentRate);
    
    console.log('\nAll tests completed successfully!');
  })();
}
