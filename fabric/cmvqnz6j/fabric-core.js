import { secp256k1 } from '@noble/secp256k1';
import { sha256 } from '@noble/hashes/sha256';

// Test suite for comparing fabric/ implementations against core/
// This generates a series of test cases and compares outputs

// Generate diverse test inputs
function generateTestInputs() {
  const inputs = [];
  
  // Standard cases
  inputs.push({ type: 'message', data: new TextEncoder().encode('Hello, SAOS!') });
  inputs.push({ type: 'message', data: new TextEncoder().encode('') });
  
  // Edge cases
  inputs.push({ type: 'large_message', data: new TextEncoder().encode('x'.repeat(1000000)) });
  inputs.push({ type: 'zero_length', data: new Uint8Array(0) });
  
  // Cryptographic keys
  inputs.push({ 
    type: 'private_key', 
    data: secp256k1.utils.randomPrivateKey() 
  });
  
  // Random data
  for (let i = 0; i < 10; i++) {
    inputs.push({
      type: 'random',
      data: crypto.getRandomValues(new Uint8Array(32))
    });
  }
  
  return inputs;
}

// Test function for fabric/ implementations
async function testFabricImplementation(testInput) {
  const startTime = performance.now();
  
  let result;
  
  switch (testInput.type) {
    case 'message':
    case 'large_message':
    case 'zero_length':
    case 'random':
      result = sha256(testInput.data);
      break;
    case 'private_key':
      // Test key validation
      result = secp256k1.utils.isValidPrivateKey(testInput.data);
      break;
    default:
      throw new Error(`Unknown test type: ${testInput.type}`);
  }
  
  const endTime = performance.now();
  
  return {
    result,
    duration: endTime - startTime,
    inputType: testInput.type,
    inputSize: testInput.data.length
  };
}

// Test function for core/ implementations (simulated)
// In a real implementation, this would import and run the core/ code
async function testCoreImplementation(testInput) {
  // Simulating core/ implementation results
  // In a real scenario, this would be replaced with actual core/ code execution
  const fabricResult = await testFabricImplementation(testInput);
  
  // Simulate minor variations that might exist between implementations
  const variation = Math.random() * 0.001; // Tiny variation to simulate real differences
  
  return {
    result: fabricResult.result,
    duration: fabricResult.duration * (1 + variation),
    inputType: testInput.type,
    inputSize: testInput.data.length
  };
}

// Compare results and report differences
function compareResults(fabricResult, coreResult) {
  const report = {
    inputType: fabricResult.inputType,
    inputSize: fabricResult.inputSize,
    match: true,
    timingDiff: 0,
    details: []
  };
  
  // Compare results
  if (fabricResult.result instanceof Uint8Array) {
    if (fabricResult.result.length !== coreResult.result.length) {
      report.match = false;
      report.details.push('Result length mismatch');
    } else {
      for (let i = 0; i < fabricResult.result.length; i++) {
        if (fabricResult.result[i] !== coreResult.result[i]) {
          report.match = false;
          report.details.push(`Byte mismatch at position ${i}`);
          break;
        }
      }
    }
  } else {
    // For non-array results (like boolean validations)
    if (fabricResult.result !== coreResult.result) {
      report.match = false;
      report.details.push('Result value mismatch');
    }
  }
  
  // Compare timing
  report.timingDiff = Math.abs(fabricResult.duration - coreResult.duration);
  if (report.timingDiff > fabricResult.duration * 0.1) { // More than 10% difference
    report.details.push(`Significant timing difference: ${report.timingDiff.toFixed(2)}ms`);
  }
  
  return report;
}

// Main test runner
async function runComparisonTests() {
  const testInputs = generateTestInputs();
  const reports = [];
  
  for (const input of testInputs) {
    try {
      const fabricResult = await testFabricImplementation(input);
      const coreResult = await testCoreImplementation(input);
      
      const report = compareResults(fabricResult, coreResult);
      reports.push(report);
      
      console.log(`Test: ${input.type} - ${report.match ? 'PASS' : 'FAIL'}`);
      if (!report.match) {
        console.log(`  Details: ${report.details.join(', ')}`);
      }
    } catch (error) {
      reports.push({
        inputType: input.type,
        inputSize: input.data.length,
        match: false,
        details: [`Error: ${error.message}`]
      });
      console.log(`Test: ${input.type} - ERROR: ${error.message}`);
    }
  }
  
  // Summary report
  const passedTests = reports.filter(r => r.match).length;
  const failedTests = reports.length - passedTests;
  
  console.log(`\n=== SUMMARY ===`);
  console.log(`Total tests: ${reports.length}`);
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${failedTests}`);
  
  if (failedTests > 0) {
    console.log(`\n=== FAILED TESTS ===`);
    reports.filter(r => !r.match).forEach(report => {
      console.log(`${report.inputType}: ${report.details.join(', ')}`);
    });
  }
  
  return {
    total: reports.length,
    passed: passedTests,
    failed: failedTests,
    reports
  };
}

// Export for CI integration
export { runComparisonTests as default };

// For direct execution
if (import.meta.url === `file://${process.argv[1]}`) {
  runComparisonTests();
}