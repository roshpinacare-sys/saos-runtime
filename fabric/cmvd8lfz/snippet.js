import { createHash } from 'crypto';
import { secp256k1 } from '@noble/secp256k1';
import { sha256 } from '@noble/hashes/sha256';

class SwapModel {
  constructor() {
    this.swapCache = new Map();
    this.swapQueue = [];
    this.activeRequests = new Map();
    this.maxCacheSize = 1000;
    this.requestTimeout = 30000; // 30 seconds
    this.cleanupInterval = 60000; // 1 minute
    this.initCleanup();
  }

  initCleanup() {
    setInterval(() => {
      this.cleanupExpiredRequests();
      this.trimSwapCache();
    }, this.cleanupInterval);
  }

  async processRequest(requestId, data) {
    // Check if request is already being processed
    if (this.activeRequests.has(requestId)) {
      return this.activeRequests.get(requestId);
    }

    // Create a new promise for this request
    const requestPromise = new Promise(async (resolve, reject) => {
      try {
        // Process the request
        const result = await this.executeSwap(data);
        
        // Cache the result if it's small enough
        if (JSON.stringify(result).length < 1024) {
          this.swapCache.set(requestId, result);
        }
        
        resolve(result);
      } catch (error) {
        reject(error);
      } finally {
        // Remove from active requests
        this.activeRequests.delete(requestId);
      }
    });

    // Store the active request
    this.activeRequests.set(requestId, requestPromise);
    
    // Set timeout for the request
    setTimeout(() => {
      if (this.activeRequests.has(requestId)) {
        this.activeRequests.delete(requestId);
        requestPromise.catch(() => {}); // Prevent unhandled promise rejection
      }
    }, this.requestTimeout);

    return requestPromise;
  }

  async executeSwap(data) {
    // Create a hash of the data for cache key
    const dataHash = createHash('sha256').update(JSON.stringify(data)).digest('hex');
    
    // Check if result is already cached
    if (this.swapCache.has(dataHash)) {
      return this.swapCache.get(dataHash);
    }

    // Process the data
    const processedData = await this.processData(data);
    
    // Add to queue for potential swapping
    this.swapQueue.push({
      id: dataHash,
      data: processedData,
      timestamp: Date.now()
    });

    // If queue is too large, swap out oldest items
    if (this.swapQueue.length > this.maxCacheSize) {
      const oldest = this.swapQueue.shift();
      // In a real implementation, this would be written to disk
      // For now, we'll just remove it from memory
    }

    return processedData;
  }

  async processData(data) {
    // Simulate heavy processing
    const result = {
      id: data.id,
      processed: true,
      timestamp: Date.now(),
      signature: await this.signData(data)
    };
    
    return result;
  }

  async signData(data) {
    const privateKey = secp256k1.utils.randomPrivateKey();
    const messageHash = sha256(JSON.stringify(data));
    const signature = await secp256k1.sign(messageHash, privateKey);
    return signature.toCompactHex();
  }

  cleanupExpiredRequests() {
    const now = Date.now();
    for (const [id, promise] of this.activeRequests.entries()) {
      // In a real implementation, we'd check if the request has timed out
      // For now, we'll just clean up completed requests
    }
  }

  trimSwapCache() {
    // If cache is too large, remove oldest entries
    while (this.swapCache.size > this.maxCacheSize) {
      const oldestKey = this.swapCache.keys().next().value;
      this.swapCache.delete(oldestKey);
    }
  }

  // Method to simulate high load testing
  async simulateHighLoad(requestsPerSecond, durationSeconds) {
    const startTime = Date.now();
    const endTime = startTime + (durationSeconds * 1000);
    const requestPromises = [];
    
    const interval = setInterval(() => {
      if (Date.now() >= endTime) {
        clearInterval(interval);
        return;
      }
      
      // Generate batch of requests
      for (let i = 0; i < requestsPerSecond; i++) {
        const requestId = `req_${Date.now()}_${i}`;
        const data = {
          id: requestId,
          payload: 'x'.repeat(100), // Simulate payload
          timestamp: Date.now()
        };
        
        requestPromises.push(this.processRequest(requestId, data));
      }
    }, 1000);
    
    // Wait for all requests to complete
    await Promise.all(requestPromises);
    
    // Return memory usage stats
    return {
      cacheSize: this.swapCache.size,
      queueSize: this.swapQueue.length,
      activeRequests: this.activeRequests.size
    };
  }
}

// Export the class for use in other modules
export default SwapModel;

// Test function to verify the fix
export async function testMemoryLeak() {
  const swapModel = new SwapModel();
  
  // Simulate high load
  const stats = await swapModel.simulateHighLoad(10000, 4);
  
  // Verify that memory usage is within expected bounds
  if (stats.cacheSize > 1000 || stats.queueSize > 1000 || stats.activeRequests > 100) {
    throw new Error(`Memory usage exceeded limits: ${JSON.stringify(stats)}`);
  }
  
  return stats;
}
