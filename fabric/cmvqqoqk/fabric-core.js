import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

/**
 * engine-consistency-validator.mjs
 * Validates functional consistency between fabric/ engines and core/ engines.
 * Dry-run mode simulates the process without executing comparisons.
 */

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run') || args.includes('-d');
  const reportDir = path.join(__dirname, 'reports');
  const timestamp = new Date().toISOString().slice(0, 10);
  const reportPath = path.join(reportDir, `engine-consistency-${timestamp}.html`);

  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  console.log(`[validator] Starting engine consistency validation${dryRun ? ' (DRY-RUN)' : ''}`);

  // 1. Scan fabric/ for exported public functions
  const fabricRoot = path.join(__dirname, 'fabric');
  if (!fs.existsSync(fabricRoot)) {
    throw new Error('fabric/ directory not found');
  }

  const fabricEntries = fs.readdirSync(fabricRoot, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  const fabricModules = [];
  for (const entry of fabricEntries) {
    const entryPath = path.join(fabricRoot, entry);
    const files = fs.readdirSync(entryPath).filter(f => f.endsWith('.js') || f.endsWith('.mjs') || f.endsWith('.cjs'));
    for (const file of files) {
      const fullPath = path.join(entryPath, file);
      try {
        const mod = await import('file://' + fullPath);
        const exports = Object.keys(mod).filter(k => typeof mod[k] === 'function');
        if (exports.length > 0) {
          fabricModules.push({ id: entry, file, path: fullPath, exports });
        }
      } catch (e) {
        console.warn(`[validator] Failed to load ${fullPath}: ${e.message}`);
      }
    }
  }

  console.log(`[validator] Discovered ${fabricModules.length} fabric modules with exports`);

  // 2. Identify core/ counterparts (if core/ exists)
  const coreRoot = path.join(__dirname, 'core');
  const coreModules = [];
  if (fs.existsSync(coreRoot)) {
    const coreEntries = fs.readdirSync(coreRoot, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
    for (const entry of coreEntries) {
      const entryPath = path.join(coreRoot, entry);
      const files = fs.readdirSync(entryPath).filter(f => f.endsWith('.js') || f.endsWith('.mjs') || f.endsWith('.cjs'));
      for (const file of files) {
        const fullPath = path.join(entryPath, file);
        try {
          const mod = await import('file://' + fullPath);
          const exports = Object.keys(mod).filter(k => typeof mod[k] === 'function');
          if (exports.length > 0) {
            coreModules.push({ id: entry, file, path: fullPath, exports });
          }
        } catch (e) {
          console.warn(`[validator] Failed to load core module ${fullPath}: ${e.message}`);
        }
      }
    }
  } else {
    console.warn('[validator] core/ directory not found — counterpart comparison will be skipped');
  }

  console.log(`[validator] Discovered ${coreModules.length} core modules with exports`);

  // 3. Match fabric to core by export name overlap
  const matches = [];
  for (const fm of fabricModules) {
    for (const cm of coreModules) {
      const common = fm.exports.filter(e => cm.exports.includes(e));
      if (common.length > 0) {
        matches.push({ fabric: fm, core: cm, commonExports: common });
      }
    }
  }

  console.log(`[validator] Found ${matches.length} matching module pairs`);

  // 4. Define test inputs (edge cases, known values, random)
  const testInputs = [
    {}, // empty object
    { value: 0 },
    { value: -1 },
    { value: 1 },
    { value: Number.MAX_SAFE_INTEGER },
    { value: Number.MIN_SAFE_INTEGER },
    { value: 'test-string' },
    { value: '' },
    { value: null },
    { value: undefined },
    { value: [] },
    { value: [1, 2, 3] },
    { value: { nested: { deep: 'value' } } },
    { value: Buffer.from('deadbeef', 'hex') },
    { value: new Uint8Array([0xde, 0xad, 0xbe, 0xef]) },
  ];

  // 5. Run comparisons (or simulate in dry-run)
  const results = [];
  for (const match of matches) {
    for (const exportName of match.commonExports) {
      const fabricFn = match.fabric.exports[exportName];
      const coreFn = match.core.exports[exportName];
      if (!fabricFn || !coreFn) continue;

      for (const input of testInputs) {
        let fabricOut, coreOut, fabricErr, coreErr;
        if (!dryRun) {
          try { fabricOut = await fabricFn(input); } catch (e) { fabricErr = e.message; }
          try { coreOut = await coreFn(input); } catch (e) { coreErr = e.message; }
        } else {
          fabricOut = '<dry-run>'; coreOut = '<dry-run>'; fabricErr = null; coreErr = null;
        }

        const consistent = dryRun ? true : (fabricErr === coreErr && JSON.stringify(fabricOut) === JSON.stringify(coreOut));
        const diff = !dryRun && !consistent ? {
          fabric: fabricOut,
          core: coreOut,
          fabricError: fabricErr,
          coreError: coreErr,
          type: fabricErr !== coreErr ? 'error-mismatch' : 'output-mismatch'
        } : null;

        results.push({
          fabricModule: match.fabric.id,
          coreModule: match.core.id,
          function: exportName,
          input: JSON.stringify(input).slice(0, 200),
          consistent,
          diff
        });
      }
    }
  }

  // 6. Generate HTML report
  const inconsistent = results.filter(r => !r.consistent);
  const html = generateReport(results, inconsistent, dryRun, timestamp);
  fs.writeFileSync(reportPath, html);
  console.log(`[validator] Report written to ${reportPath}`);
  console.log(`[validator] Total tests: ${results.length}, Inconsistent: ${inconsistent.length}`);

  if (inconsistent.length > 0 && !dryRun) {
    process.exitCode = 1;
  }
}

function generateReport(results, inconsistent, dryRun, date) {
  const passRate = results.length ? ((results.length - inconsistent.length) / results.length * 100).toFixed(2) : 100;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"><title>Engine Consistency Report ${date}</title>
<style>
body{font-family:system-ui,sans-serif;background:#0d1117;color:#e6edf3;margin:0;padding:2rem}
main{max-width:1200px;margin:0 auto}h1{color:#7ee787}
.summary{display:flex;gap:2rem;margin:1rem 0;flex-wrap:wrap}
.card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:1rem 1.5rem;min-width:180px}
.card h3{margin:0 0 .5rem;color:#79c0ff;font-size:1rem}
.card .val{font-size:1.8rem;font-weight:600;color:#7ee787}
.card .val.warn{color:#d29922}
.card .val.fail{color:#f85149}
table{width:100%;border-collapse:collapse;margin-top:1rem;font-size:.85rem}
th,td{border:1px solid #30363d;padding:.5rem .75rem;text-align:left}
th{background:#161b22;color:#79c0ff}
tr:nth-child(even){background:#161b22}
tr.fail{background:#2d0a0a}
code{background:#161b22;padding:.1rem .3rem;border-radius:4px}
.recommend{background:#1f3a1f;border:1px solid #3a7d3a;border-radius:8px;padding:1rem;margin-top:2rem}
.recommend h2{color:#7ee787;margin-top:0}
.recommend ul{padding-left:1.2rem}
</style>
</head>
<body><main>
<h1>Engine Consistency Validation Report</h1>
<p>Generated: ${new Date().toISOString()}${dryRun ? ' (DRY-RUN MODE)' : ''}</p>

<div class="summary">
  <div class="card"><h3>Total Comparisons</h3><div class="val">${results.length}</div></div>
  <div class="card"><h3>Consistent</h3><div class="val">${results.length - inconsistent.length}</div></div>
  <div class="card"><h3>Inconsistent</h3><div class="val ${inconsistent.length ? 'fail' : ''}">${inconsistent.length}</div></div>
  <div class="card"><h3>Pass Rate</h3><div class="val ${inconsistent.length ? 'warn' : ''}">${passRate}%</div></div>
</div>

<h2>Detailed Results</h2>
<table>
<thead><tr><th>Fabric Module</th><th>Core Module</th><th>Function</th><th>Input (truncated)</th><th>Status</th><th>Details</th></tr></thead>
<tbody>
${results.map(r => `
<tr class="${r.consistent ? '' : 'fail'}">
  <td>${r.fabricModule}</td><td>${r.coreModule}</td><td><code>${r.function}</code></td>
  <td><code>${r.input}</code></td>
  <td>${r.consistent ? '✅ PASS' : '❌ FAIL'}</td>
  <td>${r.diff ? `<pre style="margin:0;white-space:pre-wrap;font-size:.75rem">${JSON.stringify(r.diff, null, 2).slice(0, 500)}</pre>` : '—'}</td>
</tr>`).join('')}
</tbody>
</table>

<div class="recommend">
<h2>Recommendations</h2>
${inconsistent.length === 0 ? '<p>All engine outputs are consistent. No action required.</p>' : '
<ul>
  <li><strong>Investigate error mismatches</strong>: Functions throwing different error types/messages indicate divergent failure handling — align try/catch contracts.</li>
  <li><strong>Normalize output serialization</strong>: Output mismatches often stem from Buffer vs Uint8Array, BigInt serialization, or undefined vs null — enforce a canonical output format in both engines.</li>
  <li><strong>Add contract tests</strong>: For each inconsistent function, add a shared test vector in a common test suite to prevent regression.</li>
  <li><strong>Review core/ parity</strong>: If core/ is missing counterparts for fabric/ exports, decide whether to implement, deprecate, or document the divergence.</li>
  <li><strong>Run in CI</strong>: Integrate this validator in a scheduled workflow (e.g., daily) to catch drift early.</li>
</ul>'}
</div>
</main></body></html>`;
}

main().catch(err => {
  console.error('[validator] Fatal error:', err);
  process.exit(1);
});
