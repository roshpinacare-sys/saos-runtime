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
 * G77-g EXTENSION (2026-10-26 ~16:00Z, measured run 40346411998): after the
 * engine-restore (96a84b5a2) the gate STILL died — selftest.mjs present but
 * `ERR_MODULE_NOT_FOUND engine/scripts/saos-setup.mjs` (the wipe took the
 * cockpit ROOT scripts/+src/; the restore covered only mini-services). Cure
 * contract adds:
 *   6. dependency-heal — the clone step restores the measured absent deps
 *      from the repo's own estate/engine-code lineage (restore-only, never
 *      overwrites, fail-honest on lineage absence);
 *   7. wound class 2 — gate failed while source present ⇒ fresh honest
 *      verdict ENGINE-SELFTEST-UNRUNNABLE/GATE-FAILED on the canonical path
 *      (no more silent starvation between red run and canonical home);
 *   8. the watchdog's wounded-carried law keys off BOTH named wounds;
 *   9. the chain anchor probe retries with measured escalation (10s, 25s).
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

/* ── 3b · G77-g beat recovery — the second measured wound class ──────────
 * MEASURED (run 40346411998 @ 2026-10-26T15:08:51Z, after engine-restore
 * 96a84b5a2): selftest.mjs PRESENT but the gate died
 * `ERR_MODULE_NOT_FOUND .../engine/scripts/saos-setup.mjs` — the seal-host
 * wipe removed the cockpit ROOT scripts/+src/ while the restore brought back
 * only mini-services/saos-engine. Module-present + gate-failed wrote NO
 * verdict → the canonical home starved again (heartbeat frozen at
 * 2026-10-24T19:00:27Z despite a red run). The beat keeps its voice under
 * BOTH wound classes, and the workflow heals the measured missing deps from
 * the cockpit clone's own lineage so the gate can actually run. */

t("[heal] clone step restores the measured absent selftest deps from the cockpit clone's OWN lineage", () => {
  const i = RT.indexOf("name: Clone the private engine tree");
  const step = RT.slice(i, RT.indexOf("- name:", i + 10));
  for (const f of ["scripts/saos-setup.mjs", "scripts/worklog-analytics.mjs", "src/lib/llm-chain.ts"]) {
    assert.ok(step.includes(`"${f}"`), `heal must cover the measured missing dep: ${f}`);
  }
  assert.ok(step.includes('[ ! -s "$F" ]'),
    "heal is restore-only: a non-empty cockpit file is NEVER overwritten (absent or zero-byte wipe residue heals)");
  assert.ok(step.includes('git rev-list -8 HEAD -- "$F"'),
    "heal walks the clone's own history (rev-list) — no external branch dependency");
  assert.ok(step.includes('git cat-file -e "$CAND:$F"'),
    "heal restores only a version verified present in lineage (cat-file -e), never fabricates content");
  assert.ok(step.includes('git cat-file blob "$CAND:$F" > "$F"'),
    "heal extracts the exact lineage bytes (cat-file blob), blob OID echoed as the receipt");
});

t("[heal] heal is fail-honest: unrecoverable lineage is reported, never fabricated, gate still runs", () => {
  const i = RT.indexOf("name: Clone the private engine tree");
  const step = RT.slice(i, RT.indexOf("- name:", i + 10));
  assert.ok(step.includes("NOT recoverable from the clone's lineage — heal limited, wound will be named honestly"),
    "a file absent from lineage must degrade honestly (echo), the gate still runs and the wound gets named");
});

t("[wounded-verdict] second wound class: gate failed while source present writes ENGINE-SELFTEST-UNRUNNABLE (fresh, honest)", () => {
  const i = RT.indexOf("name: Wounded-engine verdict");
  const step = RT.slice(i, RT.indexOf("- name:", i + 10));
  assert.ok(step.includes("ENGINE-SELFTEST-UNRUNNABLE"),
    "module-present + gate-failed must write the honest unrunnable-class verdict (no silent starvation)");
  assert.ok(step.includes("steps.selftest_gate.outcome"),
    "the unrunnable branch must be conditioned on the measured gate outcome");
  assert.ok(step.includes("mini-services/saos-engine/state/beat/ci-last-heartbeat.json"),
    "the unrunnable verdict must land on the same 26-b canonical engine-tree path");
});

function woundedVerdictJsons() {
  const i = RT.indexOf("name: Wounded-engine verdict");
  const step = RT.slice(i, RT.indexOf("- name:", i + 10));
  const out = [];
  for (const m of step.matchAll(/printf '(\{[^']*?\})\\n'/g)) {
    const fmt = m[1].replace(/\\n$/, "");
    assert.equal((fmt.match(/%s/g) || []).length, 1,
      "wounded verdict format must take exactly one %s (the timestamp)");
    out.push(JSON.parse(fmt.replace("%s", "2026-10-26T13:34:12Z")));
  }
  assert.ok(out.length >= 2, "expected both wound-class verdict writers (module-absent + gate-failed)");
  return out;
}

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

t("[schema] BOTH wound-class verdicts: exact keys {at, engine, selftest, note} + scrub-clean (G77-g class 2 measured)", () => {
  const vs = woundedVerdictJsons();
  const engines = vs.map((v) => v.engine);
  assert.ok(engines.includes("ENGINE-SOURCE-MISSING"), "class 1 (module absent) verdict must exist");
  assert.ok(engines.includes("ENGINE-SELFTEST-UNRUNNABLE"), "class 2 (gate failed, source present) verdict must exist");
  for (const v of vs) {
    assert.deepEqual(Object.keys(v).sort(), ["at", "engine", "note", "selftest"],
      "every wound-class verdict carries ONLY the beat's own measurement");
    const raw = JSON.stringify(v);
    assert.ok(!new RegExp("[1-9A-HJ-NP-Za-km-z]{50}").test(raw), "scrub: no base58(50)");
    assert.ok(!new RegExp("[0-9a-fA-F]{40}").test(raw), "scrub: no hex(40)");
    assert.ok(!raw.includes("ghp_") && !raw.includes("github_pat_"), "scrub: no token prefixes");
  }
  const v2 = vs.find((v) => v.engine === "ENGINE-SELFTEST-UNRUNNABLE");
  assert.equal(v2.selftest, "GATE-FAILED", "class 2 must name the measured gate failure, never a fabricated pass");
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

t("[carried] wounded guard derives ONLY from a fresh heartbeat declaring the wound (G77-g: both honest wound names)", () => {
  assert.ok(
    WD.includes('wounded = hb_ok and hb.get("engine") in ("ENGINE-SOURCE-MISSING", "ENGINE-SELFTEST-UNRUNNABLE")'),
    "the wounded law must key off the heartbeat's own honest engine verdict — now the full set of named wounds " +
      "(module-absent G76-g + selftest-unrunnable G77-g). Never keyed off anything but the heartbeat verdict itself",
  );
});

t("[probe] measured RPC backoff: public nodes wobble — probe retries escalate 10s then 25s (3 attempts)", () => {
  const i = RT.indexOf("name: Chain anchor probe");
  const step = RT.slice(i, RT.indexOf("- name:", i + 10));
  assert.ok(/sleep 10/.test(step) && /sleep 25/.test(step),
    "probe backoff must be measured escalation (10s first retry, 25s second) — not a bare single retry");
  const attempts = (step.match(/node scripts\/chain-anchor-probe.mjs/g) || []).length;
  assert.ok(attempts >= 3, `probe must be attempted up to 3 times, found ${attempts}`);
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
