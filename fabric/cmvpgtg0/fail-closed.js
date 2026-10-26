import { createHash } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const EWMA_ALPHA = 0.25; // Smoothing factor for EWMA
const EWMA_DECAY = 0.75; // Decay factor for EWMA
const FAIL_CLOSED_THRESHOLD = 0.7; // 70% failure rate triggers fail-closed
const DEFAULT_REQUEST_TIMEOUT = 5000; // 5 seconds default timeout
const MAX_CONCURRENT_REQUESTS = 50; // Global concurrency limit
const BUCKET_SIZE = 1000; // 1-second time window for rate limiting

// Global state
let globalState = {
  ewma: 0, // Exponentially Weighted Moving Average of response times
  failureRate: 0, // Rolling failure rate
  bucket: new Array(BUCKET_SIZE).fill(0), // Request count per millisecond bucket
  bucketIndex: 0, // Current bucket index
  lastBucketUpdate: Date.now(),
  isFailClosed: false,
  activeRequests: 0,
  totalRequests: 0,
  totalFailures: 0,
  lastReset: Date.now(),
  requestHistory: [] // Last 1000 requests for analysis
};

// Utility functions
const sleep = (ms) => setTimeout(ms);
const now = () => Date.now();

// Update EWMA with new response time
function updateEWMA(responseTime) {
  globalState.ewma = EWMA_ALPHA * responseTime + EWMA_DECAY * globalState.ewma;
}

// Update failure rate
function updateFailureRate(isFailure) {
  globalState.totalRequests++;
  if (isFailure) {
    globalState.totalFailures++;
  }
  
  // Calculate rolling failure rate (last 1000 requests)
  globalState.failureRate = globalState.totalFailures / globalState.totalRequests;
  
  // Check if we should enter fail-closed mode
  if (globalState.failureRate >= FAIL_CLOSED_THRESHOLD) {
    globalState.isFailClosed = true;
  }
}

// Update request bucket
function updateBucket() {
  const now = Date.now();
  const timeDiff = now - globalState.lastBucketUpdate;
  
  // Move forward in time buckets
  if (timeDiff >= 1000) {
    const bucketsToAdvance = Math.floor(timeDiff / 1000);
    for (let i = 0; i < bucketsToAdvance; i++) {
      globalState.bucket[globalState.bucketIndex] = 0;
      globalState.bucketIndex = (globalState.bucketIndex + 1) % BUCKET_SIZE;
    }
    globalState.lastBucketUpdate = now;
  }
}

// Get current request rate
function getCurrentRate() {
  updateBucket();
  
  // Calculate rate over the last 10 seconds
  let totalRequests = 0;
  for (let i = 0; i < 10; i++) {
    const bucketIndex = (globalState.bucketIndex - i + BUCKET_SIZE) % BUCKET_SIZE;
    totalRequests += globalState.bucket[bucketIndex];
  }
  
  return totalRequests / 10; // Requests per second
}

// Check if we should throttle a request
function shouldThrottle() {
  const currentRate = getCurrentRate();
  const maxRate = 100; // Max requests per second
  
  return currentRate >= maxRate || globalState.activeRequests >= MAX_CONCURRENT_REQUESTS;
}

// Get randomized delay based on network conditions
function getDelay() {
  if (globalState.isFailClosed) {
    return 30000; // 30 seconds delay in fail-closed mode
  }
  
  // Base delay with randomization
  const baseDelay = Math.min(1000, Math.max(100, globalState.ewma / 2));
  const randomization = Math.random() * baseDelay * 0.5;
  
  // Add extra delay if we're approaching limits
  const currentRate = getCurrentRate();
  const maxRate = 100;
  const congestionFactor = Math.max(1, (currentRate / maxRate) * 2);
  
  return (baseDelay + randomization) * congestionFactor;
}

// Make a request with rate limiting and fail-closed protection
export async function makeRequest(url, options = {}) {
  // Check if we're in fail-closed mode
  if (globalState.isFailClosed) {
    throw new Error('Network pacer: System in fail-closed mode - all requests blocked');
  }
  
  // Check if we should throttle
  if (shouldThrottle()) {
    const delay = getDelay();
    await sleep(delay);
    
    // Check again after delay
    if (globalState.isFailClosed || shouldThrottle()) {
      throw new Error('Network pacer: Throttled request rejected');
    }
  }
  
  // Record request start time
  const startTime = now();
  const requestId = createHash('sha256').update(`${url}-${startTime}`).digest('hex');
  
  try {
    globalState.activeRequests++;
    
    // Make the actual request
    const response = await fetch(url, {
      ...options,
      timeout: options.timeout || DEFAULT_REQUEST_TIMEOUT
    });
    
    // Calculate response time
    const responseTime = now() - startTime;
    
    // Update metrics
    updateEWMA(responseTime);
    updateFailureRate(!response.ok);
    
    // Update bucket
    updateBucket();
    globalState.bucket[globalState.bucketIndex]++;
    
    // Record request history
    globalState.requestHistory.push({
      id: requestId,
      url,
      startTime,
      endTime: now(),
      responseTime,
      status: response.status,
      isFailure: !response.ok
    });
    
    // Keep history size manageable
    if (globalState.requestHistory.length > 1000) {
      globalState.requestHistory.shift();
    }
    
    return response;
  } catch (error) {
    // Update metrics for failed requests
    const responseTime = now() - startTime;
    updateEWMA(responseTime);
    updateFailureRate(true);
    
    // Record request history
    globalState.requestHistory.push({
      id: requestId,
      url,
      startTime,
      endTime: now(),
      responseTime,
      status: 'ERROR',
      isFailure: true,
      error: error.message
    });
    
    throw error;
  } finally {
    globalState.activeRequests--;
  }
}

// Get network status report
export function getNetworkStatus() {
  const currentRate = getCurrentRate();
  const uptime = now() - globalState.lastReset;
  
  return {
    status: globalState.isFailClosed ? 'FAIL_CLOSED' : 'OPERATIONAL',
    ewma: Math.round(globalState.ewma),
    failureRate: globalState.failureRate,
    currentRate: Math.round(currentRate),
    activeRequests: globalState.activeRequests,
    totalRequests: globalState.totalRequests,
    totalFailures: globalState.totalFailures,
    uptime: Math.round(uptime / 1000), // seconds
    lastReset: new Date(globalState.lastReset).toISOString(),
    healthScore: calculateHealthScore()
  };
}

// Calculate health score (0-100)
function calculateHealthScore() {
  if (globalState.isFailClosed) {
    return 0;
  }
  
  let score = 100;
  
  // Deduct points for high failure rate
  score -= globalState.failureRate * 50;
  
  // Deduct points for high EWMA (slow responses)
  if (globalState.ewma > 2000) {
    score -= Math.min(30, (globalState.ewma - 2000) / 100);
  }
  
  // Deduct points for high request rate
  const currentRate = getCurrentRate();
  if (currentRate > 80) {
    score -= Math.min(20, (currentRate - 80) / 5);
  }
  
  return Math.max(0, Math.round(score));
}

// Reset pacer state (emergency use only)
export function resetPacer() {
  globalState = {
    ewma: 0,
    failureRate: 0,
    bucket: new Array(BUCKET_SIZE).fill(0),
    bucketIndex: 0,
    lastBucketUpdate: Date.now(),
    isFailClosed: false,
    activeRequests: 0,
    totalRequests: 0,
    totalFailures: 0,
    lastReset: Date.now(),
    requestHistory: []
  };
}

// Get request history for analysis
export function getRequestHistory(limit = 100) {
  return globalState.requestHistory.slice(-limit);
}

// Initialize with configuration
export function initPacer(config = {}) {
  if (config.ewmaAlpha !== undefined) {
    EWMA_ALPHA = config.ewmaAlpha;
  }
  if (config.failClosedThreshold !== undefined) {
    FAIL_CLOSED_THRESHOLD = config.failClosedThreshold;
  }
  if (config.defaultTimeout !== undefined) {
    DEFAULT_REQUEST_TIMEOUT = config.defaultTimeout;
  }
  if (config.maxConcurrent !== undefined) {
    MAX_CONCURRENT_REQUESTS = config.maxConcurrent;
  }
  if (config.bucketSize !== undefined) {
    BUCKET_SIZE = config.bucketSize;
  }
}

// Export for Node.js use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    makeRequest,
    getNetworkStatus,
    getRequestHistory,
    resetPacer,
    initPacer
  };
}
