/**
 * test-grid-vocabulary.mjs — THE VOCABULARY CONTRACT (G69 · 2026-10-23)
 *
 * The 27-a lesson, made law: the watchdog instrument and the producing
 * organs MUST share one verdict vocabulary, or the grid paints false reds
 * on the exact states the system is supposed to reach (measured live:
 * social=SOCIAL-IDLE + socialExecuted=0 painted red because the green set
 * only knew "IDLE"; the SUCCESS verdict SOCIAL-EXECUTED was never in the
 * set at all — a false alarm waiting for the organ to actually work).
 *
 * This test is deterministic (no network, no state, no clock):
 *   1. parses .github/workflows/grid-watchdog.yml and extracts the
 *      GREEN/WAIT verdict sets for every gated organ;
 *   2. asserts the CANONICAL PRODUCER VERDICTS (as emitted by the engine
 *      organs — army-social.mjs runSocial et al.) are covered by green∪wait;
 *   3. asserts the facts extractor carries the flat-heartbeat fallback so
 *      executed/refused are measured numbers, never silent nulls.
 *
 * Fail-loud: any drift between producer vocabulary and instrument fails
 * the grid-watchdog run BEFORE the decide step (the instrument itself is
 * broken — it must refuse to paint).
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WF = join(ROOT, ".github", "workflows", "grid-watchdog.yml");

/* ── 1 · the canonical producer vocabulary ─────────────────────────────
 * Every verdict string the producing organs can emit for each lane.
 * Source of truth: the engine organs themselves (steem/saos-engine).
 * Keep additive-only: a producer verdict missing here = unmeasured lane. */
const PRODUCER_VERDICTS = {
  social: [
    /* army-social.mjs runSocial (654/658/799): the step verdicts */
    "SOCIAL-EXECUTED", /* executed > 0 — THE SUCCESS STATE */
    "SOCIAL-IDLE", /* nothing due — the idle engine doing its job */
    "PART-GATED", /* some refused — partial gate */
    "SOCIAL-STANDBY", /* custody-protection brake (WAIT, designed) */
    /* legacy generic greens kept by the instrument */
    "OK", "GREEN", "HEALTHY", "PASS", "COMPLETE", "IDLE", "READY",
  ],
  content: [
    "OK", "GREEN", "PUBLISHED", "DRAFTS-QUEUED", "IDLE", "QUEUED", "READY",
  ],
  digest: [
    "OK", "GREEN", "PUBLISHED", "COOLDOWN", "SKIPPED", "IDLE", "READY", "DIGEST-READY",
  ],
  delegation: [
    "OK", "GREEN", "EXECUTED", "COMPLETE", "IDLE", "READY", "DELEGATED", "ALREADY-TODAY",
    "CUSTODY-GATE-REFUSED", "NO-OPS", "DELEGATION-DISARMED",
  ],
  dex: [
    "STANDBY", "IDLE", "TAKEOVER-EXECUTED",
  ],
};

/* ── extraction (robust text surgery, no yaml dep) ─────────────────────── */
function extractSet(text, lane, kind) {
  /* matches: "social": ["A", "B"]  or  "social": {"A", "B"}  (any indent) */
  const re = new RegExp(`"${lane}"\\s*:\\s*\\${kind === "green" ? "[" : "{"}([^\\]}]*)\\${kind === "green" ? "]" : "}"}`, "g");
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push(m[1].split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean));
  }
  return out;
}

const yml = readFileSync(WF, "utf8");

/* ── tests ─────────────────────────────────────────────────────────────── */
let tests = 0;
const t = (name, fn) => { tests++; fn(); };

t("workflow file exists and is non-empty", () => {
  assert.ok(existsSync(WF), `missing ${WF}`);
  assert.ok(yml.length > 1000, "grid-watchdog.yml suspiciously small");
});

for (const lane of Object.keys(PRODUCER_VERDICTS)) {
  t(`[${lane}] every producer verdict is covered by green∪wait (all set instances)`, () => {
    const greens = extractSet(yml, lane, "green");
    const waits = extractSet(yml, lane, "wait");
    /* dex-class lanes may be WAIT-only by design (standby/brake states) */
    assert.ok(
      greens.length + waits.length >= 1,
      `no GREEN/WAIT set found for ${lane}`,
    );
    const waitUnion = new Set(waits.flat());
    for (const g of greens) {
      for (const v of PRODUCER_VERDICTS[lane]) {
        const covered = g.includes(v) || waitUnion.has(v);
        assert.ok(
          covered,
          `drift: producer verdict "${v}" (${lane}) is NOT in a GREEN set nor in WAIT — the instrument would paint a false red on a lawful state (27-a family). GREEN=${JSON.stringify(g)} WAIT=${JSON.stringify([...waitUnion])}`,
        );
      }
    }
  });
}

t("[social] the SUCCESS verdict SOCIAL-EXECUTED is in EVERY green set instance", () => {
  const greens = extractSet(yml, "social", "green");
  assert.ok(greens.length >= 2, `expected ≥2 green-set instances (decide + thresholds), found ${greens.length}`);
  for (const g of greens) assert.ok(g.includes("SOCIAL-EXECUTED"), `green set missing SOCIAL-EXECUTED: ${JSON.stringify(g)}`);
});

t("[social] the pacing verdict SOCIAL-IDLE is in EVERY green set instance", () => {
  const greens = extractSet(yml, "social", "green");
  for (const g of greens) assert.ok(g.includes("SOCIAL-IDLE"), `green set missing SOCIAL-IDLE: ${JSON.stringify(g)}`);
});

t("facts extractor carries the flat-heartbeat fallback (executed/refused measured, never null-by-shape)", () => {
  assert.ok(
    yml.includes('so.get("executed", hb.get("socialExecuted"))'),
    "facts must fall back to flat heartbeat socialExecuted (canonical beat file is flat — no steps dict)",
  );
  assert.ok(
    yml.includes('so.get("refused", hb.get("socialRefused"))'),
    "facts must fall back to flat heartbeat socialRefused",
  );
});

console.log(`OK · vocabulary-contract · ${tests} tests · producers=${Object.keys(PRODUCER_VERDICTS).join(",")}`);
