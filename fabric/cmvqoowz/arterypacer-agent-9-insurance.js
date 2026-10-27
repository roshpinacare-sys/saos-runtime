// artery-pacer-module.mjs
import { ewma } from '@noble/hashes';

/**
 * EWMA Circuit Breaker implementation
 * @param {number} threshold - Threshold for opening the circuit
 * @param {number} decay - Decay factor for EWMA calculation
 * @returns {Object} Circuit breaker object with methods
 */
export function ewmaCircuitBreaker(threshold = 5, decay = 0.8) {
  let state = 'closed'; // closed, open, half-open
  let failures = 0;
  let ewmaValue = 0;
  
  return {
    /**
     * Record a success or failure
     * @param {boolean} success - Whether the operation succeeded
     */
    record: (success) => {
      if (success) {
        ewmaValue = ewmaValue * decay + (1 - decay) * 0;
        if (state === 'half-open') {
          state = 'closed';
          failures = 0;
        }
      } else {
        ewmaValue = ewmaValue * decay + (1 - decay) * 1;
        failures++;
        if (ewmaValue > threshold && state !== 'open') {
          state = 'open';
        }
      }
    },
    
    /**
     * Check if the circuit allows requests
     * @returns {boolean} True if requests are allowed
     */
    allowRequest: () => {
      return state !== 'open';
    },
    
    /**
     * Reset the circuit breaker to closed state
     */
    reset: () => {
      state = 'closed';
      failures = 0;
      ewmaValue = 0;
    },
    
    /**
     * Get current state
     * @returns {string} Current state
     */
    getState: () => state,
    
    /**
     * Get current EWMA value
     * @returns {number} Current EWMA value
     */
    getEwmaValue: () => ewmaValue
  };
}

/**
 * Artery Pacer implementation
 * @param {number} minDelay - Minimum delay between operations
 * @param {number} maxDelay - Maximum delay between operations
 * @param {number} backoffFactor - Backoff factor for delays
 * @returns {Object} Pacer object with methods
 */
export function arteryPacer(minDelay = 100, maxDelay = 5000, backoffFactor = 2) {
  let lastOperationTime = 0;
  let currentDelay = minDelay;
  
  return {
    /**
     * Wait for the appropriate delay before allowing next operation
     * @returns {Promise} Resolves when delay is complete
     */
    wait: () => {
      const now = Date.now();
      const timeSinceLastOp = now - lastOperationTime;
      
      if (timeSinceLastOp < currentDelay) {
        const waitTime = currentDelay - timeSinceLastOp;
        return new Promise(resolve => setTimeout(resolve, waitTime));
      }
      
      lastOperationTime = now;
      return Promise.resolve();
    },
    
    /**
     * Record a failure and increase delay
     */
    recordFailure: () => {
      currentDelay = Math.min(currentDelay * backoffFactor, maxDelay);
    },
    
    /**
     * Record a success and decrease delay
     */
    recordSuccess: () => {
      currentDelay = Math.max(currentDelay / backoffFactor, minDelay);
    },
    
    /**
     * Reset pacer to initial state
     */
    reset: () => {
      currentDelay = minDelay;
      lastOperationTime = 0;
    },
    
    /**
     * Get current delay
     * @returns {number} Current delay
     */
    getCurrentDelay: () => currentDelay
  };
}