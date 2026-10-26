/**
 * test-watchdog-reds.mjs — THE RED-CURE CONTRACT (G76-g · 2026-10-26)
 *
 * The 2 measured reds @ 2026-10-26T13:34:12Z (watchdog commit 6ca9321):
 *   · heartbeat.fresh  — canonical beat verdict (saos-runtime@main:state/beat/
 *     ci-last-heartbeat.json) starved since 2026-10-24T19:00:27Z (age 42.6h).
 *   · anchor.probe     — verdict=unavailable (state/anchor-probe.json absent
 *     from steem@saos-cockpit:mini-services/saos-engine/state/).
 *
 * MEASURED root cause (runs 40292421398 → 40334352334, all failing steps 6+12):
 * seal-host commit 4b1cd2ed8 (2026-10-24T19:16:26Z) wiped the engine source
 * from the cockpit tree — mini-services/saos-engine now holds only receipts/+
 * state/, so the fail-closed Selftest gate dies "Cannot find module ...
 * selftest.mjs" BEFORE any verdict is written, and the beat starves.
 *
 * The cure (this contract, additive — nothing weakened, nothing silenced):
 *   1. NEW engine.source signal (grid-watchdog.yml): direct measurement of the
 *      engine source on the cockpit tree. Red = absent. The wound gets a name.
 *   2. Wounded-engine verdict (sovereign-runtime.yml): when the engine source
 *      is absent, the beat writes an honest FRESH verdict (engine=
 *      ENGINE-SOURCE-MISSING) so the canonical home keeps flowing — the beat
 *      keeps its voice. No lane verdicts are fabricated.
 *   3. Wounded-carried law (grid-watchdog.yml): lanes that read the wounded
 *      verdict show WOUNDED (carried) — visible, not red-noise — while
 *      engine.source carries the single loud red. (26-c precedent: counting
 *      the consequence red too is double-counting noise.)
 *   4. Fail-loud laws UNCHANGED: heartbeat.fresh 5400/2400 expression,
 *      pulse.fresh expression, custody verified>=14 — byte-asserted below so
 *      this diff provably cannot weaken them.
 *   5. The automated retry path is the pulse self-dispatch chain (measured:
 *      ~30min cadence, damping 1800s on red) — the beat keeps knocking until
 *      the engine source returns, then recovery is zero-touch.
 *
 * Deterministic: no network, no state, no clock. Fail-loud on any drift.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WD = readFileSync(join(ROOT, ".github", "workflows", "grid-watchdog.yml"), "utf8");
const RT = readFileSync(join(ROOT, ".github", "workflows", "sovereign-runtime.yml"), "utf8");

let tests = 0;
const t = (name, fn) => { tests++; fn(); };

/* ── 1 · engine.source — the wound gets a name ─────────────────────────── */

t("[engine.source] signal measured directly on the cockpit tree (selftest.mjs readable)", () => {
  assert.ok(WD.includes('signals["engine.source"] = {'), "engine.source signal missing from watchdog");
  assert.ok(
    WD.includes('/repos/%s/steem/contents/mini-services/saos-engine/selftest.mjs?ref=saos-cockpit'),
    "engine.source must measure the engine source at steem@saos-cockpit:mini-services/saos-engine/selftest.mjs",
  );
});

t("[engine.source] fail-closed red: unreadable source = red, present = green", () => {
  assert.ok(
    WD.includes('esrc_present = isinstance(esrc, dict) and esrc.get("encoding") == "base64"'),
    "engine.source presence must be measured (base64 file payload readable)",
  );
  assert.ok(
    WD.includes('"red": not esrc_present'),
    "engine.source red must be exactly `not esrc_present` — absent = red (fail-closed), present = green",
  );
});

t("[engine.source] appears in the STATUS order list, right after heartbeat.fresh", () => {
  const m = WD.match(/order = \[([^\]]*)\]/);
  assert.ok(m, "STATUS order list missing");
  const order = m[1].split(",").map((s) => s.trim().replace(/^"|"$/g, "")).filter(Boolean);
  const i = order.indexOf("engine.source");
  assert.ok(i > -1, "engine.source not in STATUS order list");
  assert.equal(order[i - 1], "heartbeat.fresh", "engine.source must sit right after heartbeat.fresh");
});

/* ── 2 · fail-loud laws UNCHANGED (anti-weakening byte locks) ──────────── */

t("[law] heartbeat.fresh red expression is byte-unchanged (5400 fail-loud / 2400 in-flight grace)", () => {
  assert.ok(
    WD.includes("hb_red = (hb_age is None) or (hb_age > 5400) or (hb_age > 2400 and rt_inflight is None)"),
    "heartbeat.fresh red law drifted — weakening the fail-loud law is forbidden",
  );
});

t("[law] pulse.fresh red expression is byte-unchanged (failed OR >5400 OR >2400 not in-flight)", () => {
  assert.ok(
    WD.includes('p_red = (p_age is None) or (p_concl is not None and p_concl != "success") or (p_age > 5400) or (p_age > 2400 and not p_inflight)'),
    "pulse.fresh red law drifted — forbidden",
  );
});

t("[law] custody threshold verified>=14 is byte-unchanged", () => {
  assert.ok(
    WD.includes('"red": (not isinstance(verified, int)) or verified < 14,'),
    "custody.coverage red law drifted — forbidden",
  );
});

t("[law] anchor.probe real-fault law unchanged: verdict=OK and fresh stays the only green", () => {
  assert.ok(WD.includes('ap_red = (ap_v != "OK") or (not ap_fresh)'), "anchor.probe red law drifted — forbidden");
});

/* ── 3 · wounded-engine verdict — the beat keeps its voice ─────────────── */

t("[wounded-verdict] selftest gate carries an id; wounded step runs even when the gate failed", () => {
  assert.ok(RT.includes("id: selftest_gate"), "selftest gate step must carry id: selftest_gate");
  assert.ok(RT.includes("name: Wounded-engine verdict"), "wounded-verdict step missing");
  const step = RT.slice(RT.indexOf("name: Wounded-engine verdict"));
  const head = step.slice(0, step.indexOf("- name:", 10) > 0 ? step.indexOf("- name:", 10) : 4000);
  assert.ok(/if: always\(\)/.test(head), "wounded step must run on gate failure (if: always())");
});

t("[wounded-verdict] writes ENGINE-SOURCE-MISSING to the canonical engine-tree path", () => {
  const i = RT.indexOf("name: Wounded-engine verdict");
  const step = RT.slice(i, RT.indexOf("- name:", i + 10));
  assert.ok(step.includes("mini-services/saos-engine/state/beat/ci-last-heartbeat.json"),
    "wounded verdict must land on the 26-b canonical engine-tree path");
  assert.ok(step.includes("ENGINE-SOURCE-MISSING"), "wounded verdict must carry the honest engine verdict");
  assert.ok(step.includes('[ ! -f mini-services/saos-engine/selftest.mjs ]'),
    "wounded verdict must be gated on the measured absence of the engine source (never on a bare gate failure)");
});

t("[wounded-verdict] no-op when the engine source is present (healthy era untouched)", () => {
  const i = RT.indexOf("name: Wounded-engine verdict");
  const step = RT.slice(i, RT.indexOf("- name:", i + 10));
  assert.ok(/else/.test(step) && step.includes("engine source present"),
    "wounded step must be an explicit no-op when the engine source exists");
});

/* ── 4 · wounded verdict schema (extracted from the workflow itself) ───── */

function woundedVerdictJson() {
  const i = RT.indexOf("name: Wounded-engine verdict");
  const step = RT.slice(i, RT.indexOf("- name:", i + 10));
  const m = step.match(/printf '(\{[^']*?\})\\n'/);
  assert.ok(m, "wounded verdict printf format string not found");
  const fmt = m[1].replace(/\\n$/, "");
  const slots = (fmt.match(/%s/g) || []).length;
  assert.equal(slots, 1, "wounded verdict format must take exactly one %s (the timestamp)");
  const at = "2026-10-26T13:34:12Z";
  return JSON.parse(fmt.replace("%s", at));
}

t("[schema] wounded verdict: exact keys {at, engine, selftest, note} — zero fabricated lanes", () => {
  const v = woundedVerdictJson();
  assert.deepEqual(
    Object.keys(v).sort(),
    ["at", "engine", "note", "selftest"],
    "wounded verdict must carry ONLY the beat's own measurement — no custody/social/dex/blurt lane verdicts may be fabricated",
  );
  assert.equal(v.engine, "ENGINE-SOURCE-MISSING");
  assert.equal(v.selftest, "MODULE-ABSENT");
});

t("[schema] wounded verdict: parseable ISO-8601 `at` and clean of key-material (26-b verdicts-only scrub)", () => {
  const raw = JSON.stringify(woundedVerdictJson());
  assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(woundedVerdictJson().at), "at must be ISO-8601 Z");
  assert.ok(!new RegExp("[1-9A-HJ-NP-Za-km-z]{50}").test(raw), "verdicts-only scrub: no base58(50) pattern");
  assert.ok(!new RegExp("[0-9a-fA-F]{40}").test(raw), "verdicts-only scrub: no hex(40) pattern");
  assert.ok(!raw.includes("ghp_") && !raw.includes("github_pat_"), "verdicts-only scrub: no token prefixes");
});

/* ── 5 · wounded-carried law — consequences amber, the wound red ───────── */

t("[carried] engine-lane wounded guards classify absence as ENGINE-WOUNDED (carried by engine.source)", () => {
  const guards = [
    "wounded and verified is None",                                 // custody.coverage
    "wounded and sv is None",                                       // social.verdict
    "wounded and cv is None",                                       // content.verdict
    "wounded and dxv is None",                                      // dex.anchor
    "wounded and live is None",                                     // blurt.live
    "wounded and dgv is None",                                      // digest.verdict
    "wounded and dlv is None",                                      // delegation.verdict
    'wounded and (ap_v is None or ap_v == "PROBE-SCRIPT-ABSENT")',  // anchor.probe
  ];
  for (const g of guards) {
    assert.ok(WD.includes(g), `missing wounded guard for lane: ${g}`);
  }
  assert.ok(
    (WD.match(/ENGINE-WOUNDED — carried by engine\.source/g) || []).length >= 8,
    "each wounded lane must say so in its measured string (visible, never silent)",
  );
});

t("[carried] real faults stay red even while wounded (probe FAILED / engine lanes measured)", () => {
  assert.ok(
    WD.includes('ap_red = (ap_v != "OK") or (not ap_fresh)'),
    "anchor.probe must keep its own red law for real probe failures",
  );
  /* every wounded guard must be conditioned on the fresh heartbeat declaring the
   * wound — never a blanket silence (a probe that RAN and FAILED still paints red) */
  const guards = WD.match(/if wounded and [^\n]+:/g) || [];
  assert.ok(guards.length >= 8, `expected ≥8 wounded guards, found ${guards.length}`);
  for (const g of guards) {
    assert.ok(g.startsWith("if wounded and "), `guard not wound-conditioned: ${g}`);
  }
  assert.ok(
    WD.includes('if wounded and (ap_v is None or ap_v == "PROBE-SCRIPT-ABSENT"):'),
    "anchor.probe amber must match ONLY couldn't-run states — verdict=FAILED stays red",
  );
});

t("[carried] STATUS renders WOUNDED (carried) and the legend documents it", () => {
  assert.ok(WD.includes('return "WOUNDED (carried)"'), "status_word must render the WOUNDED (carried) class");
  assert.ok(
    WD.includes("WOUNDED (carried): the lane is unmeasured because the engine is wounded; the wound itself is RED under engine.source"),
    "legend must document the WOUNDED (carried) class",
  );
});

t("[carried] wounded guard derives ONLY from a fresh heartbeat declaring the wound", () => {
  assert.ok(
    WD.includes('wounded = hb_ok and hb.get("engine") == "ENGINE-SOURCE-MISSING"'),
    "the wounded law must key off the heartbeat's own honest verdict, nothing else",
  );
});

/* ── 6 · the automated retry path (the beat keeps knocking) ────────────── */

t("[retry] pulse chain damping law intact: red = alarm, not amplifier (1800s backoff)", () => {
  assert.ok(
    RT.includes('if [ "$HB_RESULT" != "success" ]; then') && RT.includes("sleep 1800"),
    "the red-run damping law must stay (red cadence ≤ ~30min)",
  );
});

t("[retry] pulse self-dispatch survives transient failures (3 attempts) — zero-touch recovery when the engine returns", () => {
  assert.ok(/for i in 1 2 3; do/.test(RT), "3-attempt dispatch loop missing");
  assert.ok(
    RT.includes("actions/workflows/sovereign-runtime.yml/dispatches"),
    "pulse self-dispatch path missing",
  );
});

/* ── 7 · honest probe verdict when the probe script itself is absent ───── */

t("[probe] anchor-probe records PROBE-SCRIPT-ABSENT (honest) instead of a false FAILED", () => {
  const i = RT.indexOf("name: Chain anchor probe");
  const step = RT.slice(i, RT.indexOf("- name:", i + 10));
  assert.ok(step.includes("PROBE-SCRIPT-ABSENT"), "probe step must record the honest absent-script verdict");
  assert.ok(
    step.indexOf("PROBE-SCRIPT-ABSENT") < step.indexOf("node scripts/chain-anchor-probe.mjs"),
    "the absent-script branch must be checked BEFORE invoking the probe",
  );
});

console.log(`OK · watchdog-reds-contract · ${tests} tests · engine.source+wounded-verdict+carried-law+retry`);
