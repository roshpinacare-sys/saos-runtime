import { createHash } from 'crypto';
import { secp256k1 } from '@noble/secp256k1';
import { sha256 } from '@noble/hashes/sha256';

class DynamicResourceAllocator {
  constructor(config = {}) {
    this.maxRequestsPerSecond = config.maxRequestsPerSecond || 500;
    this.historicalData = new Map();
    this.taskQueue = [];
    this.activeTasks = new Map();
    this.resourcePool = {
      cpu: config.initialCpu || 4,
      memory: config.initialMemory || 1024,
      network: config.initialNetwork || 100
    };
    this.bottleneckThreshold = config.bottleneckThreshold || 0.8;
    this.predictionWindow = config.predictionWindow || 5 * 60 * 1000; // 5 minutes
    this.lastAdjustmentTime = Date.now();
  }

  // Record performance metrics for historical analysis
  recordPerformance(taskId, executionTime, resourceUsage) {
    if (!this.historicalData.has(taskId)) {
      this.historicalData.set(taskId, []);
    }
    
    this.historicalData.get(taskId).push({
      timestamp: Date.now(),
      executionTime,
      resourceUsage
    });
    
    // Keep only recent data (last hour)
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const data = this.historicalData.get(taskId).filter(entry => entry.timestamp > oneHourAgo);
    this.historicalData.set(taskId, data);
  }

  // Analyze historical data to identify bottlenecks
  identifyBottlenecks() {
    const bottlenecks = [];
    const now = Date.now();
    
    for (const [taskId, data] of this.historicalData) {
      if (data.length < 5) continue; // Need sufficient data points
      
      const recentData = data.filter(entry => now - entry.timestamp < this.predictionWindow);
      const avgExecutionTime = recentData.reduce((sum, entry) => sum + entry.executionTime, 0) / recentData.length;
      const avgResourceUsage = recentData.reduce((sum, entry) => sum + entry.resourceUsage, 0) / recentData.length;
      
      // Check if this task is consistently slow or resource-intensive
      if (avgExecutionTime > 1000 || avgResourceUsage > this.bottleneckThreshold) {
        bottlenecks.push({
          taskId,
          avgExecutionTime,
          avgResourceUsage,
          priority: this.calculatePriority(avgExecutionTime, avgResourceUsage)
        });
      }
    }
    
    return bottlenecks.sort((a, b) => b.priority - a.priority);
  }

  // Calculate priority based on execution time and resource usage
  calculatePriority(executionTime, resourceUsage) {
    const timeWeight = 0.6;
    const resourceWeight = 0.4;
    
    // Normalize values (0-1 scale)
    const normalizedTime = Math.min(executionTime / 2000, 1);
    const normalizedResource = Math.min(resourceUsage / 1, 1);
    
    return timeWeight * normalizedTime + resourceWeight * normalizedResource;
  }

  // Predict future load based on historical patterns
  predictFutureLoad() {
    const now = Date.now();
    const predictions = [];
    
    // Analyze patterns in the last hour
    const oneHourAgo = now - 60 * 60 * 1000;
    let totalRequests = 0;
    let recentRequests = 0;
    
    for (const data of this.historicalData.values()) {
      const hourlyData = data.filter(entry => entry.timestamp > oneHourAgo);
      const recentData = data.filter(entry => entry.timestamp > now - 10 * 60 * 1000);
      
      totalRequests += hourlyData.length;
      recentRequests += recentData.length;
    }
    
    // Calculate request rate
    const requestsPerMinute = totalRequests / 60;
    const recentRequestsPerMinute = recentRequests / 10;
    
    // Predict based on trend
    const trend = recentRequestsPerMinute > requestsPerMinute ? 'increasing' : 'stable';
    
    // Calculate predicted load for next 5 minutes
    let predictedLoad = requestsPerMinute;
    if (trend === 'increasing') {
      predictedLoad = recentRequestsPerMinute * 1.2; // 20% increase
    }
    
    return {
      predictedRequestsPerMinute: predictedLoad,
      trend,
      confidence: Math.min(recentRequests / 100, 1) // More data = higher confidence
    };
  }

  // Allocate resources based on bottlenecks and predictions
  allocateResources() {
    const now = Date.now();
    
    // Only adjust resources every 30 seconds to avoid thrashing
    if (now - this.lastAdjustmentTime < 30000) {
      return this.resourcePool;
    }
    
    this.lastAdjustmentTime = now;
    
    // Identify current bottlenecks
    const bottlenecks = this.identifyBottlenecks();
    
    // Predict future load
    const prediction = this.predictFutureLoad();
    
    // Calculate required resources
    const requiredResources = this.calculateRequiredResources(prediction, bottlenecks);
    
    // Adjust resource pool
    this.adjustResourcePool(requiredResources);
    
    return { ...this.resourcePool };
  }

  // Calculate required resources based on predictions and bottlenecks
  calculateRequiredResources(prediction, bottlenecks) {
    const baseCpu = 4;
    const baseMemory = 1024;
    const baseNetwork = 100;
    
    // Scale based on predicted load
    const loadFactor = Math.min(prediction.predictedRequestsPerMinute / this.maxRequestsPerSecond, 2);
    
    // Add extra resources for bottlenecks
    const bottleneckFactor = Math.min(bottlenecks.length * 0.2, 1);
    
    // Calculate required resources with confidence weighting
    const confidenceWeight = prediction.confidence;
    
    return {
      cpu: Math.ceil(baseCpu * loadFactor * (1 + bottleneckFactor * confidenceWeight)),
      memory: Math.ceil(baseMemory * loadFactor * (1 + bottleneckFactor * confidenceWeight)),
      network: Math.ceil(baseNetwork * loadFactor * (1 + bottleneckFactor * confidenceWeight))
    };
  }

  // Adjust the resource pool based on requirements
  adjustResourcePool(required) {
    // Gradual adjustment to avoid sudden changes
    const adjustmentFactor = 0.2;
    
    this.resourcePool.cpu += (required.cpu - this.resourcePool.cpu) * adjustmentFactor;
    this.resourcePool.memory += (required.memory - this.resourcePool.memory) * adjustmentFactor;
    this.resourcePool.network += (required.network - this.resourcePool.network) * adjustmentFactor;
    
    // Ensure minimum resources
    this.resourcePool.cpu = Math.max(this.resourcePool.cpu, 1);
    this.resourcePool.memory = Math.max(this.resourcePool.memory, 256);
    this.resourcePool.network = Math.max(this.resourcePool.network, 10);
    
    // Cap at maximum reasonable limits
    this.resourcePool.cpu = Math.min(this.resourcePool.cpu, 16);
    this.resourcePool.memory = Math.min(this.resourcePool.memory, 4096);
    this.resourcePool.network = Math.min(this.resourcePool.network, 1000);
  }

  // Add a task to the queue with dynamic priority
  addTask(taskId, estimatedExecutionTime = 1000, estimatedResourceUsage = 0.5) {
    // Calculate dynamic priority based on current system state
    const bottlenecks = this.identifyBottlenecks();
    const prediction = this.predictFutureLoad();
    
    // Base priority
    let priority = 1;
    
    // Increase priority if system is under high load
    if (prediction.predictedRequestsPerMinute > this.maxRequestsPerSecond * 0.8) {
      priority += 2;
    }
    
    // Increase priority if this task is identified as a bottleneck
    const bottleneck = bottlenecks.find(b => b.taskId === taskId);
    if (bottleneck) {
      priority += bottleneck.priority * 3;
    }
    
    // Add to queue with calculated priority
    this.taskQueue.push({
      taskId,
      estimatedExecutionTime,
      estimatedResourceUsage,
      priority,
      timestamp: Date.now()
    });
    
    // Sort queue by priority
    this.taskQueue.sort((a, b) => b.priority - a.priority);
  }

  // Process tasks from the queue
  processNextTask() {
    if (this.taskQueue.length === 0) {
      return null;
    }
    
    // Allocate resources
    const resources = this.allocateResources();
    
    // Get the highest priority task
    const task = this.taskQueue.shift();
    
    // Simulate task execution
    const startTime = Date.now();
    
    // In a real implementation, this would be an actual task execution
    const executionTime = task.estimatedExecutionTime * (1 + (Math.random() * 0.4 - 0.2)); // ±20% variation
    const actualResourceUsage = task.estimatedResourceUsage * (1 + (Math.random() * 0.4 - 0.2)); // ±20% variation
    
    // Simulate async execution
    setTimeout(() => {
      const endTime = Date.now();
      const actualExecutionTime = endTime - startTime;
      
      // Record performance metrics
      this.recordPerformance(task.taskId, actualExecutionTime, actualResourceUsage);
      
      // Remove from active tasks
      this.activeTasks.delete(task.taskId);
    }, executionTime);
    
    // Add to active tasks
    this.activeTasks.set(task.taskId, {
      task,
      startTime,
      estimatedCompletionTime: startTime + executionTime
    });
    
    return task;
  }

  // Get current system status
  getStatus() {
    const bottlenecks = this.identifyBottlenecks();
    const prediction = this.predictFutureLoad();
    
    return {
      resourcePool: { ...this.resourcePool },
      queueLength: this.taskQueue.length,
      activeTasks: this.activeTasks.size,
      bottlenecks,
      prediction,
      timestamp: Date.now()
    };
  }
}

// Example usage
const allocator = new DynamicResourceAllocator({
  maxRequestsPerSecond: 500,
  initialCpu: 4,
  initialMemory: 1024,
  initialNetwork: 100
});

// Simulate adding tasks
for (let i = 0; i < 100; i++) {
  const isBottleneck = Math.random() > 0.8; // 20% chance of being a bottleneck
  const executionTime = isBottleneck ? 2000 : 500 + Math.random() * 500;
  const resourceUsage = isBottleneck ? 0.9 : 0.3 + Math.random() * 0.4;
  
  allocator.addTask(`task-${i}`, executionTime, resourceUsage);
}

// Process tasks
const processInterval = setInterval(() => {
  const task = allocator.processNextTask();
  
  if (!task) {
    console.log('No more tasks to process');
    clearInterval(processInterval);
    
    // Print final status
    console.log('Final System Status:', JSON.stringify(allocator.getStatus(), null, 2));
  } else {
    console.log(`Processing task: ${task.taskId} with priority ${task.priority}`);
  }
}, 100); // Process a task every 100ms

// Simulate load spikes
setTimeout(() => {
  console.log('Simulating load spike...');
  for (let i = 100; i < 150; i++) {
    allocator.addTask(`spike-task-${i}`, 300 + Math.random() * 300, 0.2 + Math.random() * 0.3);
  }
}, 5000);

// Print status periodically
setInterval(() => {
  console.log('Current Status:', allocator.getStatus());
}, 2000);
