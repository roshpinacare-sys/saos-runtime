// distributed-artery-pacer.mjs

import { createHash } from 'crypto';
import { setInterval, clearInterval } from 'timers';

// Constants
const DEFAULT_MAX_REQUESTS_PER_SECOND = 5;
const DEFAULT_HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
const DEFAULT_CIRCUIT_BREAKER_THRESHOLD = 5;
const DEFAULT_CIRCUIT_BREAKER_TIMEOUT = 60000; // 60 seconds
const DEFAULT_FAIL_CLOSED_TIMEOUT = 120000; // 2 minutes

// Agent-specific configuration
const AGENT_CONFIGS = {
  'agent-9-insurance': {
    maxRequestsPerSecond: 3,
    healthCheckInterval: 20000,
    circuitBreakerThreshold: 3,
    circuitBreakerTimeout: 45000,
    failClosedTimeout: 90000
  },
  'default': {
    maxRequestsPerSecond: DEFAULT_MAX_REQUESTS_PER_SECOND,
    healthCheckInterval: DEFAULT_HEALTH_CHECK_INTERVAL,
    circuitBreakerThreshold: DEFAULT_CIRCUIT_BREAKER_THRESHOLD,
    circuitBreakerTimeout: DEFAULT_CIRCUIT_BREAKER_TIMEOUT,
    failClosedTimeout: DEFAULT_FAIL_CLOSED_TIMEOUT
  }
};

// State management
const agentState = {
  requestCount: 0,
  lastResetTime: Date.now(),
  errorCount: 0,
  lastErrorTime: null,
  isCircuitBreakerOpen: false,
  circuitBreakerTimeout: null,
  isFailClosed: false,
  failClosedTimeout: null,
  lastHealthCheck: Date.now(),
  isHealthy: true
};

// Agent identification
const agentId = process.env.AGENT_ID || 'default';
const agentConfig = AGENT_CONFIGS[agentId] || AGENT_CONFIGS['default'];

// Initialize agent
function initializeAgent() {
  console.log(`Initializing Distributed Artery Pacer for agent: ${agentId}`);
  
  // Start health check interval
  const healthCheckInterval = setInterval(performHealthCheck, agentConfig.healthCheckInterval);
  
  // Start rate reset interval
  const rateResetInterval = setInterval(resetRateLimit, 1000);
  
  // Start circuit breaker timeout check
  const circuitBreakerCheck = setInterval(checkCircuitBreakerTimeout, 5000);
  
  // Start fail closed timeout check
  const failClosedCheck = setInterval(checkFailClosedTimeout, 5000);
  
  // Store interval IDs for cleanup
  agentState.intervals = {
    healthCheck: healthCheckInterval,
    rateReset: rateResetInterval,
    circuitBreaker: circuitBreakerCheck,
    failClosed: failClosedCheck
  };
  
  // Register shutdown handler
  process.on('SIGTERM', cleanup);
  process.on('SIGINT', cleanup);
}

// Health check function
function performHealthCheck() {
  const now = Date.now();
  agentState.lastHealthCheck = now;
  
  // Simulate health check - in real implementation this would check actual services
  const isHealthy = Math.random() > 0.1; // 90% chance of being healthy
  
  if (!isHealthy && agentState.isHealthy) {
    console.warn(`Health check failed for agent: ${agentId}`);
    agentState.isHealthy = false;
    agentState.errorCount++;
    agentState.lastErrorTime = now;
    
    // Check if we should open the circuit breaker
    if (agentState.errorCount >= agentConfig.circuitBreakerThreshold) {
      openCircuitBreaker();
    }
    
    // Check if we should go fail-closed
    if (agentState.errorCount >= agentConfig.circuitBreakerThreshold * 2) {
      enterFailClosedState();
    }
  } else if (isHealthy && !agentState.isHealthy) {
    console.log(`Health check passed for agent: ${agentId}`);
    agentState.isHealthy = true;
    agentState.errorCount = 0;
  }
  
  // Report status to control center
  reportStatus();
}

// Rate limiting
function canMakeRequest() {
  const now = Date.now();
  
  // Check if we're in fail-closed state
  if (agentState.isFailClosed) {
    console.log(`Agent ${agentId} is in fail-closed state. Request denied.`);
    return false;
  }
  
  // Check if circuit breaker is open
  if (agentState.isCircuitBreakerOpen) {
    console.log(`Agent ${agentId} circuit breaker is open. Request denied.`);
    return false;
  }
  
  // Reset rate limit counter if needed
  if (now - agentState.lastResetTime >= 1000) {
    agentState.requestCount = 0;
    agentState.lastResetTime = now;
  }
  
  // Check if we've exceeded the rate limit
  if (agentState.requestCount >= agentConfig.maxRequestsPerSecond) {
    console.log(`Rate limit exceeded for agent: ${agentId}`);
    return false;
  }
  
  return true;
}

// Make request with rate limiting and error handling
async function makeRequest(requestFn) {
  if (!canMakeRequest()) {
    throw new Error('Request denied due to rate limiting, circuit breaker, or fail-closed state');
  }
  
  agentState.requestCount++;
  
  try {
    const result = await requestFn();
    return result;
  } catch (error) {
    handleRequestError(error);
    throw error;
  }
}

// Handle request errors
function handleRequestError(error) {
  console.error(`Request error for agent ${agentId}:`, error);
  agentState.errorCount++;
  agentState.lastErrorTime = Date.now();
  
  // Check if we should open the circuit breaker
  if (agentState.errorCount >= agentConfig.circuitBreakerThreshold) {
    openCircuitBreaker();
  }
  
  // Check if we should go fail-closed
  if (agentState.errorCount >= agentConfig.circuitBreakerThreshold * 2) {
    enterFailClosedState();
  }
  
  // Report status to control center
  reportStatus();
}

// Open circuit breaker
function openCircuitBreaker() {
  if (!agentState.isCircuitBreakerOpen) {
    console.log(`Opening circuit breaker for agent: ${agentId}`);
    agentState.isCircuitBreakerOpen = true;
    
    // Set timeout to close circuit breaker
    agentState.circuitBreakerTimeout = setTimeout(() => {
      closeCircuitBreaker();
    }, agentConfig.circuitBreakerTimeout);
    
    // Report status to control center
    reportStatus();
  }
}

// Close circuit breaker
function closeCircuitBreaker() {
  if (agentState.isCircuitBreakerOpen) {
    console.log(`Closing circuit breaker for agent: ${agentId}`);
    agentState.isCircuitBreakerOpen = false;
    
    if (agentState.circuitBreakerTimeout) {
      clearTimeout(agentState.circuitBreakerTimeout);
      agentState.circuitBreakerTimeout = null;
    }
    
    // Report status to control center
    reportStatus();
  }
}

// Enter fail-closed state
function enterFailClosedState() {
  if (!agentState.isFailClosed) {
    console.log(`Entering fail-closed state for agent: ${agentId}`);
    agentState.isFailClosed = true;
    
    // Set timeout to exit fail-closed state
    agentState.failClosedTimeout = setTimeout(() => {
      exitFailClosedState();
    }, agentConfig.failClosedTimeout);
    
    // Report status to control center
    reportStatus();
  }
}

// Exit fail-closed state
function exitFailClosedState() {
  if (agentState.isFailClosed) {
    console.log(`Exiting fail-closed state for agent: ${agentId}`);
    agentState.isFailClosed = false;
    agentState.errorCount = 0;
    
    if (agentState.failClosedTimeout) {
      clearTimeout(agentState.failClosedTimeout);
      agentState.failClosedTimeout = null;
    }
    
    // Report status to control center
    reportStatus();
  }
}

// Check circuit breaker timeout
function checkCircuitBreakerTimeout() {
  if (agentState.isCircuitBreakerOpen && !agentState.circuitBreakerTimeout) {
    // This should not happen, but just in case
    closeCircuitBreaker();
  }
}

// Check fail-closed timeout
function checkFailClosedTimeout() {
  if (agentState.isFailClosed && !agentState.failClosedTimeout) {
    // This should not happen, but just in case
    exitFailClosedState();
  }
}

// Reset rate limit counter
function resetRateLimit() {
  const now = Date.now();
  if (now - agentState.lastResetTime >= 1000) {
    agentState.requestCount = 0;
    agentState.lastResetTime = now;
  }
}

// Report status to control center
function reportStatus() {
  const status = {
    agentId: agentId,
    timestamp: Date.now(),
    requestCount: agentState.requestCount,
    errorCount: agentState.errorCount,
    isCircuitBreakerOpen: agentState.isCircuitBreakerOpen,
    isFailClosed: agentState.isFailClosed,
    isHealthy: agentState.isHealthy,
    lastHealthCheck: agentState.lastHealthCheck
  };
  
  // In a real implementation, this would send the status to the control center
  // For now, we'll just log it
  console.log('Agent status:', status);
}

// Cleanup function
function cleanup() {
  console.log(`Cleaning up agent: ${agentId}`);
  
  // Clear all intervals
  if (agentState.intervals) {
    for (const intervalId of Object.values(agentState.intervals)) {
      clearInterval(intervalId);
    }
  }
  
  // Clear all timeouts
  if (agentState.circuitBreakerTimeout) {
    clearTimeout(agentState.circuitBreakerTimeout);
  }
  
  if (agentState.failClosedTimeout) {
    clearTimeout(agentState.failClosedTimeout);
  }
  
  // Final status report
  reportStatus();
  
  // Exit process
  process.exit(0);
}

// API functions
export function start() {
  initializeAgent();
}

export async function executeWithRateLimit(requestFn) {
  return makeRequest(requestFn);
}

export function getStatus() {
  return {
    agentId: agentId,
    isCircuitBreakerOpen: agentState.isCircuitBreakerOpen,
    isFailClosed: agentState.isFailClosed,
    isHealthy: agentState.isHealthy,
    requestCount: agentState.requestCount,
    errorCount: agentState.errorCount
  };
}

export function forceCircuitBreakerOpen() {
  openCircuitBreaker();
}

export function forceCircuitBreakerClose() {
  closeCircuitBreaker();
}

export function forceFailClosed() {
  enterFailClosedState();
}

export function forceFailClosedRecovery() {
  exitFailClosedState();
}

// Start the agent if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  start();
}
