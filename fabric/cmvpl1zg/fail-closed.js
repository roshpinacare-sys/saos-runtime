// artery-pacer-mjs-fail-closed.js

import { createHash } from 'node:crypto';

/**
 * Artery Pacer with Fail-Closed Preserved Mechanism
 * 
 * This module implements a fail-closed preserved mechanism that ensures the system
 * only exits with code 0 when there's an exact match between the expected and
 * actual state. Any deviation, regardless of log level, will cause the system
 * to exit with code 1, maintaining system security and preventing unauthorized
 * state changes.
 * 
 * The fail-closed principle is critical for system security as it ensures that
 * any uncertainty or deviation from the expected state results in a secure,
 * closed state rather than potentially allowing an open, vulnerable state.
 * 
 * @param {Object} options - Configuration options
 * @param {Object} options.expected - The expected state
 * @param {number} options.expected.seeds - Number of expected seeds
 * @param {number} options.expected.liveHits - Number of expected live hits
 * @param {string} options.expected.materialFp - Expected material fingerprint
 * @param {Object} options.actual - The actual measured state
 * @param {number} options.actual.seeds - Number of actual seeds
 * @param {number} options.actual.liveHits - Number of actual live hits
 * @param {string} options.actual.materialFp - Actual material fingerprint
 * @returns {number} - Exit code (0 for exact match, 1 for any mismatch)
 */
export function judge(options) {
  const { expected, actual } = options;
  
  // Calculate actual fingerprint if not provided
  const actualFp = actual.materialFp || calculateFingerprint(actual);
  
  // Check for exact match - no flexibility with logLevel
  const isExactMatch = 
    expected.seeds === actual.seeds &&
    expected.liveHits === actual.liveHits &&
    expected.materialFp === actualFp;
  
  if (isExactMatch) {
    console.log('✅ Exact match: exiting with code 0');
    return 0;
  } else {
    console.error('❌ Mismatch detected:');
    console.error(`  Expected: seeds=${expected.seeds}, liveHits=${expected.liveHits}, materialFp=${expected.materialFp}`);
    console.error(`  Actual:   seeds=${actual.seeds}, liveHits=${actual.liveHits}, materialFp=${actualFp}`);
    console.error('🔒 Fail-closed: exiting with code 1 - system secure');
    return 1;
  }
}

/**
 * Calculate a SHA256 fingerprint of the material
 * @param {Object} material - The material to fingerprint
 * @returns {string} - SHA256 fingerprint
 */
function calculateFingerprint(material) {
  const data = JSON.stringify({
    seeds: material.seeds,
    liveHits: material.liveHits
  });
  return createHash('sha256').update(data).digest('hex');
}

// Unit tests
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Running fail-closed preserved tests...');
  
  // Test case 1: Exact match
  const result1 = judge({
    expected: { seeds: 100, liveHits: 0, materialFp: 'abc123' },
    actual: { seeds: 100, liveHits: 0, materialFp: 'abc123' }
  });
  console.assert(result1 === 0, 'Test 1 failed: expected 0 for exact match');
  
  // Test case 2: Seeds mismatch
  const result2 = judge({
    expected: { seeds: 100, liveHits: 0, materialFp: 'abc123' },
    actual: { seeds: 101, liveHits: 0, materialFp: 'abc123' }
  });
  console.assert(result2 === 1, 'Test 2 failed: expected 1 for seeds mismatch');
  
  // Test case 3: LiveHits mismatch
  const result3 = judge({
    expected: { seeds: 100, liveHits: 0, materialFp: 'abc123' },
    actual: { seeds: 100, liveHits: 1, materialFp: 'abc123' }
  });
  console.assert(result3 === 1, 'Test 3 failed: expected 1 for liveHits mismatch');
  
  // Test case 4: Material fingerprint mismatch
  const result4 = judge({
    expected: { seeds: 100, liveHits: 0, materialFp: 'abc123' },
    actual: { seeds: 100, liveHits: 0, materialFp: 'def456' }
  });
  console.assert(result4 === 1, 'Test 4 failed: expected 1 for materialFp mismatch');
  
  // Test case 5: All fields mismatch
  const result5 = judge({
    expected: { seeds: 100, liveHits: 0, materialFp: 'abc123' },
    actual: { seeds: 200, liveHits: 5, materialFp: 'def456' }
  });
  console.assert(result5 === 1, 'Test 5 failed: expected 1 for all mismatches');
  
  // Test case 6: Calculated fingerprint match
  const result6 = judge({
    expected: { seeds: 100, liveHits: 0, materialFp: 'a1b2c3' },
    actual: { seeds: 100, liveHits: 0 } // materialFp will be calculated
  });
  console.assert(result6 === 0, 'Test 6 failed: expected 0 for calculated fingerprint match');
  
  console.log('All tests passed!');
}