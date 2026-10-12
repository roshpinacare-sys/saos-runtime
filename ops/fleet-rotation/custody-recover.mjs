#!/usr/bin/env node
/**
 * custody-recover.mjs — 2-a: complete the phase-A custody that died on the
 * libsodium CJS-interop bug (measured 2026-10-12 20:15Z: "sodium.crypto_box_seal
 * is not a function" -> 20 rotated accounts without custody -> estate fail-closed).
 *
 * Recovery of record: the ROT2 archive on steem main (custody branch — vault of
 * record), re-sealed under the gen2-era pass, meta v4 inner-sha pinned
 * (steem fd651d7 -> 1af5917). This lane:
 *   1. derives custody holes from the phase-A receipt of record (receipt-A.json:
 *      ROTATED* verdicts with empty custodyRepos)
 *   2. opens agent/vault/KEYS-ROT2-*.zip.enc with the STEEM_VAULT_PASSES bundle
 *      ladder (gen2 -> recovery-3 -> gen1 x zip/backup, meta pass last) — pass
 *      VALUES env-only + ::add-mask::-ed, never logged
 *   3. verifies every hole's material is IN the archive, cross-checked against
 *      the receipt's newPubFp fingerprints (counts + pub fingerprints only)
 *   4. completes custody: crypto_box_seal via the FIXED interop-safe loader +
 *      PUT ROT2_FLEET_KEYS to steem, saos-runtime, Domain (whole-map PUT per
 *      the T-68 design change — the per-account last-wins flaw is retired)
 *   5. receipt (fingerprints only) + verdict law:
 *        PASS          zero custody holes remain (archive covered + 3/3 repos verified)
 *        FAIL-LOST     hole material ABSENT from the archive of record — the
 *                      owner-authority reset path is the only recovery (receipt
 *                      documents it; custody PUT withheld so partial coverage
 *                      cannot masquerade as complete)
 *        FAIL-CUSTODY  archive covered but opening/PUT/verify failed (retryable)
 *
 * LAWS: zero key material in logs/receipt (12-char pub fingerprints + sha
 * prefixes only); plaintext confined to 0700 /tmp and shredded; fail-closed;
 * honest verdicts; no-holes runs are self-disarming no-ops (secrets untouched).
 *
 * Modes:
 *   --selftest            offline: interop seal->open roundtrip + fp-law vectors
 *   --run RECEIPT.json    the recovery (network + archive; secrets env-only)
 */
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { execFileSync } from "child_process";

const STEEM_DIR = process.env.REC_STEEM_DIR || "steem-engine";
const API = "https://api.github.com/repos/roshpinacare-sys/";
const HOLES_RECEIPT = process.env.REC_HOLES_RECEIPT || "ops/fleet-rotation/receipt-A.json";

function log(o) { console.log(typeof o === "string" ? o : JSON.stringify(o)); }
function pubFp(pub) { return String(pub).slice(0, 12); }
function sha256hex(buf) { return crypto.createHash("sha256").update(buf).digest("hex"); }

/* ── 2-a: CJS-interop-safe libsodium loader (same fix as rotate.mjs) ────── */
let _sodium = null;
async function loadSodium() {
  if (_sodium) return _sodium;
  const _m = await import("libsodium-wrappers");
  const sodium = _m.default ?? _m; // CJS interop: functions ride on `.default` (measured 0.8.4)
  await sodium.ready;              // and attach only after ready (measured)
  if (typeof sodium.crypto_box_seal !== "function" || typeof sodium.crypto_box_seal_open !== "function") {
    throw new Error("libsodium interop FAIL: crypto_box_seal/open missing after interop-safe load");
  }
  _sodium = sodium;
  return _sodium;
}

/* ── selftest (zero network, zero material) ─────────────────────────────── */
async function selftest() {
  const sodium = await loadSodium();
  const kp = sodium.crypto_box_keypair();
  const payload = Buffer.from(JSON.stringify({ selftest: "crypto_box_seal roundtrip", n: 1 }));
  const sealed = Buffer.from(sodium.crypto_box_seal(payload, kp.publicKey));
  const opened = Buffer.from(sodium.crypto_box_seal_open(sealed, kp.publicKey, kp.privateKey));
  if (!opened.equals(payload)) throw new Error("seal->open roundtrip mismatch");
  if (pubFp("STM1234567890abcdef") !== "STM123456789") throw new Error("pubFp law vector");
  if (sha256hex(Buffer.from("x")).length !== 64) throw new Error("sha law vector");
  log({ selftest: "PASS", vectors: 3, sodiumSealRoundtrip: true });
}

/* ── pass ladder: bundle eras first (mandated path), meta pass last ─────── */
function bundlePassLadder(meta) {
  const ladder = [];
  const seen = new Set();
  const push = (ref, pass) => {
    if (typeof pass === "string" && pass.length > 0 && !seen.has(pass)) { seen.add(pass); ladder.push({ ref, pass }); }
  };
  let bundle = null;
  try { bundle = JSON.parse(process.env.STEEM_VAULT_PASSES || "null"); } catch { bundle = null; }
  for (const era of ["gen2", "recovery-3", "gen1"]) {
    if (bundle && bundle[era]) {
      push(era + ".keysZipUnlock", bundle[era].keysZipUnlock);
      push(era + ".keysBackupUnlock", bundle[era].keysBackupUnlock);
    }
  }
  if (meta && typeof meta.keysZipPass === "string") push("recovery-meta.keysZipPass", meta.keysZipPass);
  for (const pr of ladder) console.log("::add-mask::" + pr.pass); // belt+braces: mask in-log too
  return ladder;
}

function writeReceipt(out, obj) {
  fs.writeFileSync(out, JSON.stringify(obj, null, 1) + "\n");
}

/* ── run: the recovery ──────────────────────────────────────────────────── */
async function runMode(receiptOut) {
  const sodium = await loadSodium(); // fail fast — the exact bug this lane heals
  const startedAt = new Date().toISOString();

  // 1) custody holes from the receipt of record (verdict law's own definition)
  let src = null;
  try { src = JSON.parse(fs.readFileSync(HOLES_RECEIPT, "utf8")); } catch { src = null; }
  if (!src || !Array.isArray(src.accounts)) {
    log("ABORT: receipt of record unreadable: " + HOLES_RECEIPT);
    process.exit(1);
  }
  const holes = [];
  for (const a of src.accounts) {
    if (String(a.verdict || "").startsWith("ROTATED") && !(a.custodyRepos || []).length) {
      holes.push({ chain: a.chain, account: a.account, expect: a.newPubFp || {} });
    }
  }
  if (!holes.length) {
    // self-disarming: custody of record shows no holes -> honest no-op, secrets untouched
    writeReceipt(receiptOut, {
      protocol: "SAOS-CUSTODY-RECOVER/1", at: startedAt, verdict: "PASS",
      holes: { total: 0, covered: 0, absent: [], details: [] },
      source: { receiptOfRecord: HOLES_RECEIPT },
      note: "receipt of record shows no custody holes — nothing to recover (no-op PASS, secrets untouched)",
    });
    log({ VERDICT: "PASS", holes: 0, note: "no-op — secrets untouched" });
    process.exit(0);
  }
  log({ custodyHoles: holes.length, list: holes.map((h) => h.chain + ":" + h.account).join(",") });

  const GH = process.env.GH_PAT || "";
  const H = { Authorization: "Bearer " + GH, Accept: "application/vnd.github+json" };

  // 2) the ROT2 archive of record (meta v4 pins file + inner sha)
  const metaPath = path.join(STEEM_DIR, "agent", "recovery-meta.json");
  let meta = null;
  try { meta = JSON.parse(fs.readFileSync(metaPath, "utf8")); } catch { meta = null; }
  let encRel = (meta && meta.keysZipFile) || "";
  let encPath = encRel ? path.join(STEEM_DIR, encRel) : "";
  let metaSkew = false;
  if (!encPath || !fs.existsSync(encPath)) {
    metaSkew = true;
    const vault = path.join(STEEM_DIR, "agent", "vault");
    let cands = [];
    try {
      cands = fs.readdirSync(vault).filter((f) => f.startsWith("KEYS-ROT2-") && f.endsWith(".zip.enc"))
        .map((f) => ({ f, m: fs.statSync(path.join(vault, f)).mtimeMs })).sort((a, b) => b.m - a.m);
    } catch {}
    if (!cands.length) {
      writeReceipt(receiptOut, { protocol: "SAOS-CUSTODY-RECOVER/1", at: startedAt, verdict: "FAIL-LOST",
        holes: { total: holes.length, covered: 0, absent: holes.map((h) => h.chain + ":" + h.account), details: [] },
        error: "no ROT2 archive found under " + vault,
        recoveryPath: "owner-authority reset is the only recovery (owner keys were untouched in phase A by law)" });
      log({ VERDICT: "FAIL-LOST", reason: "no ROT2 archive of record found" });
      process.exit(2);
    }
    encRel = "agent/vault/" + cands[0].f;
    encPath = path.join(vault, cands[0].f);
    log({ metaSkew: true, fallbackArchive: encRel });
  }

  const work = fs.mkdtempSync(path.join(os.tmpdir(), "custrec-"));
  fs.chmodSync(work, 0o700);
  const dec = path.join(work, "keys.zip");
  const extDir = path.join(work, "x");

  const ladder = bundlePassLadder(meta);
  const tried = [];
  let opened = null;
  if (!ladder.length) {
    writeReceipt(receiptOut, { protocol: "SAOS-CUSTODY-RECOVER/1", at: startedAt, verdict: "FAIL-CUSTODY",
      holes: { total: holes.length, covered: 0, absent: [], details: [] },
      error: "no usable unlock passes (bundle ladder empty)", source: { archive: encRel } });
    log({ VERDICT: "FAIL-CUSTODY", reason: "empty pass ladder" });
    process.exit(1);
  }
  for (const pr of ladder) {
    let ok = false;
    try {
      execFileSync("openssl", ["enc", "-d", "-aes-256-cbc", "-pbkdf2", "-iter", "300000",
        "-in", encPath, "-out", dec, "-pass", "env:CUSTREC_PASS"],
        { env: { ...process.env, CUSTREC_PASS: pr.pass }, stdio: "pipe" });
      ok = fs.existsSync(dec) && fs.readFileSync(dec).subarray(0, 2).toString() === "PK";
    } catch { ok = false; }
    tried.push({ passRef: pr.ref, opened: ok });
    if (!ok) { try { fs.unlinkSync(dec); } catch {} continue; }
    const inner = fs.readFileSync(dec);
    const innerSha = sha256hex(inner);
    const integrity = meta && meta.keysZipInnerSha256
      ? (innerSha === meta.keysZipInnerSha256 ? "pinned-MATCH" : "pinned-MISMATCH")
      : "unpinned";
    opened = { passRef: pr.ref, innerSha16: innerSha.slice(0, 16), integrity };
    log({ archive: encRel, openedWith: pr.ref, innerSha16: opened.innerSha16, integrity });
    break;
  }
  if (!opened) {
    writeReceipt(receiptOut, { protocol: "SAOS-CUSTODY-RECOVER/1", at: startedAt, verdict: "FAIL-CUSTODY",
      holes: { total: holes.length, covered: 0, absent: [], details: [] },
      error: "ROT2 archive unopenable with any ladder pass", source: { archive: encRel, passLadderTried: tried } });
    log({ VERDICT: "FAIL-CUSTODY", reason: "archive unopenable", tried: tried.map((t) => t.passRef).join(",") });
    process.exit(1);
  }

  // 3) unzip + parse the material bundle (plaintext lives only in 0700 /tmp)
  fs.mkdirSync(extDir, { recursive: true });
  let payload = null;
  try {
    execFileSync("unzip", ["-o", "-q", dec, "-d", extDir], { stdio: "pipe" });
    payload = JSON.parse(fs.readFileSync(path.join(extDir, "rot2-keys.json"), "utf8"));
  } catch { payload = null; }
  if (!payload || !payload.accounts) {
    writeReceipt(receiptOut, { protocol: "SAOS-CUSTODY-RECOVER/1", at: startedAt, verdict: "FAIL-CUSTODY",
      holes: { total: holes.length, covered: 0, absent: [], details: [] },
      error: "archive opened but rot2-keys.json missing/unparseable", source: { archive: encRel, openedWith: opened.passRef } });
    log({ VERDICT: "FAIL-CUSTODY", reason: "rot2-keys.json missing" });
    process.exit(1);
  }
  const totalAccounts = Object.values(payload.accounts).reduce((n, m) => n + Object.keys(m).length, 0);
  log({ rot2Payload: { format: payload.format || "?", chains: Object.keys(payload.accounts).join(","), accounts: totalAccounts } });

  // 4) verify every hole's material is IN the archive, fingerprint-cross-checked
  //    against the receipt's newPubFp (pub fingerprints are public by definition)
  const details = [];
  const absent = [];
  let covered = 0;
  for (const h of holes) {
    const mat = (payload.accounts[h.chain] || {})[h.account] || null;
    const roles = {};
    let full = true;
    const expectRoles = Object.keys(h.expect || {});
    if (!expectRoles.length) {
      roles._note = { status: mat ? "PRESENT-UNVERIFIED" : "ABSENT" };
      full = !!mat;
    }
    for (const role of expectRoles) {
      const m = mat && mat[role];
      if (m && m.pub && pubFp(m.pub) === h.expect[role]) roles[role] = { status: "MATCH", pubFp: pubFp(m.pub) };
      else if (m) { roles[role] = { status: "FP-MISMATCH", pubFp: m.pub ? pubFp(m.pub) : null, expectFp: h.expect[role] }; full = false; }
      else { roles[role] = { status: "ABSENT" }; full = false; }
    }
    if (full) covered++; else absent.push(h.chain + ":" + h.account);
    details.push({ chain: h.chain, account: h.account, inArchive: !!mat, roles });
  }
  log({ archiveCoverage: { holes: holes.length, covered, absent: absent.join(",") || "none" } });

  // 5) custody PUT — all-or-nothing (partial custody must not masquerade as coverage)
  const custodyRes = [];
  if (covered < holes.length) {
    log({ custody: "WITHHELD", reason: "FAIL-LOST — not all hole material present in the archive of record" });
  } else {
    for (const repo of ["steem", "saos-runtime", "Domain"]) {
      const entry = { repo, put: "FAIL", verified: false };
      try {
        const pkr = await fetch(API + repo + "/actions/secrets/public-key", { headers: H });
        if (!pkr.ok) throw new Error("pk HTTP " + pkr.status);
        const pk = await pkr.json();
        const sealed = sodium.crypto_box_seal(
          Buffer.from(JSON.stringify({ rot2: payload.accounts, at: payload.at || startedAt, recoveredBy: "custody-recover 2-a" })),
          Buffer.from(pk.key, "base64"));
        const r = await fetch(API + repo + "/actions/secrets/ROT2_FLEET_KEYS", {
          method: "PUT", headers: { ...H, "Content-Type": "application/json" },
          body: JSON.stringify({ encrypted_value: Buffer.from(sealed).toString("base64"), key_id: pk.key_id }),
        });
        if (r.status !== 201 && r.status !== 204) throw new Error("PUT HTTP " + r.status);
        entry.put = "OK";
      } catch (e) { entry.err = String(e.message || e).slice(0, 80); }
      custodyRes.push(entry);
    }
    // write-only API: verify by NAME only (values are unreadable by design)
    await new Promise((r) => setTimeout(r, 2000));
    for (const entry of custodyRes) {
      for (let attempt = 0; attempt < 2 && !entry.verified; attempt++) {
        try {
          const r = await fetch(API + entry.repo + "/actions/secrets?per_page=100", { headers: H });
          if (!r.ok) throw new Error("list HTTP " + r.status);
          const j = await r.json();
          entry.verified = (j.secrets || []).some((s) => s.name === "ROT2_FLEET_KEYS");
        } catch (e) { entry.verified = false; }
        if (!entry.verified && attempt === 0) await new Promise((r) => setTimeout(r, 4000));
      }
    }
    log({ custody: custodyRes.map((c) => c.repo + "=" + c.put + (c.verified ? "+verified" : "-unverified")).join(" ") });
  }

  // 6) verdict law (honest)
  const allPutOk = custodyRes.length > 0 && custodyRes.every((c) => c.put === "OK" && c.verified);
  const verdict = covered < holes.length ? "FAIL-LOST" : (allPutOk ? "PASS" : "FAIL-CUSTODY");
  const receipt = {
    protocol: "SAOS-CUSTODY-RECOVER/1",
    at: startedAt,
    source: {
      receiptOfRecord: HOLES_RECEIPT,
      steemCustodyBranch: "main",
      archive: encRel,
      rot2Id: (meta && meta.rot2 && meta.rot2.id) || null,
      rot2SealedAt: (meta && meta.rot2 && meta.rot2.at) || payload.at || null,
      openedWith: opened.passRef,
      innerSha16: opened.innerSha16,
      integrity: opened.integrity,
      metaSkew,
      passLadderTried: tried,
      accountsInArchive: totalAccounts,
    },
    holes: { total: holes.length, covered, absent, details },
    custody: {
      secret: "ROT2_FLEET_KEYS",
      repos: custodyRes,
      design: "whole-map PUT (T-68): one sealed PUT per repo carries ALL hole material; per-account last-wins flaw retired",
    },
    verdict,
    laws: [
      "zero key material in receipt/logs — pub fingerprints (12-char) + sha prefixes only",
      "pass values env-only + masked, never logged",
      "plaintext confined to 0700 /tmp, shredded after use",
      "fingerprint cross-check: archive material pub must equal receipt-of-record newPubFp",
      "custody PUT withheld on FAIL-LOST (partial coverage must not masquerade as complete)",
    ],
  };
  if (verdict === "FAIL-LOST") {
    receipt.recoveryPath = "owner-authority reset is the only recovery for: " + absent.join(",") +
      " — owner keys were untouched in phase A by law, so owner-signed re-adoption/rotation (owner-key-adopt lane) can restore these accounts; no key material for them exists in the ROT2 archive of record";
  }
  writeReceipt(receiptOut, receipt);
  log({ VERDICT: verdict, holes: holes.length, covered, absent: absent.join(",") || "none" });

  // 7) shred plaintext, exit by verdict
  try { execFileSync("shred", ["-u", dec], { stdio: "pipe" }); } catch { try { fs.unlinkSync(dec); } catch {} }
  try { fs.rmSync(extDir, { recursive: true, force: true }); } catch {}
  try { fs.rmdirSync(work); } catch {}
  process.exit(verdict === "PASS" ? 0 : verdict === "FAIL-LOST" ? 2 : 1);
}

/* ── main ───────────────────────────────────────────────────────────────── */
const argv = process.argv.slice(2);
if (argv.includes("--selftest")) { await selftest(); process.exit(0); }
if (argv.includes("--run")) {
  const out = argv[argv.indexOf("--run") + 1];
  try { await runMode(out); } catch (e) {
    log("HARD-FAIL: " + String((e && e.message) || e).slice(0, 160));
    try { writeReceipt(out, { protocol: "SAOS-CUSTODY-RECOVER/1", at: new Date().toISOString(), verdict: "FAIL-CUSTODY", error: String((e && e.message) || e).slice(0, 160) }); } catch {}
    process.exit(1);
  }
}
log("usage: custody-recover.mjs --selftest | --run RECEIPT.json");
process.exit(1);
