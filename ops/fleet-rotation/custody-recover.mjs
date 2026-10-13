#!/usr/bin/env node
/**
 * custody-recover.mjs — 2-a: complete the phase-A custody that died on the
 * libsodium CJS-interop bug (measured 2026-10-12 20:15Z: "sodium.crypto_box_seal
 * is not a function" -> rotated accounts without custody -> estate fail-closed).
 *
 * Recovery of record: the ROT2 archive on steem main (custody branch — vault of
 * record), re-sealed under the gen2-era pass, meta v4 inner-sha pinned. When a
 * custody hole's material is ABSENT from the HEAD archive of record (e.g. a
 * later re-seal overwrote an earlier same-named archive), this lane digs the
 * prior seal commits' archive blobs out of steem git history (the estate's
 * documented archaeology path) and chain-judges that material against the LIVE
 * on-chain authorities — only live-matching material enters custody.
 *
 * Flow:
 *   1. derive custody holes from the phase-A receipt of record (receipt-A.json:
 *      ROTATED* verdicts with empty custodyRepos — the verdict law's definition)
 *   2. open agent/vault/KEYS-ROT2-*.zip.enc with the STEEM_VAULT_PASSES bundle
 *      ladder (gen2 -> recovery-3 -> gen1 x zip/backup, meta pass last) — pass
 *      VALUES env-only + ::add-mask::-ed, never logged
 *   3. verify every hole's material is IN the archive, cross-checked against
 *      the receipt's newPubFp fingerprints (counts + pub fingerprints only)
 *   4. holes absent from the HEAD archive: dig prior seal commits from git
 *      history, decrypt, chain-judge vs live chain authorities
 *   5. custody: crypto_box_seal via the FIXED interop-safe loader + PUT
 *      ROT2_FLEET_KEYS to steem, saos-runtime, Domain (whole recoverable map;
 *      the T-68 design change retired the per-account last-wins flaw)
 *   6. receipt (fingerprints only) + verdict law:
 *        PASS          zero custody holes remain (all covered + 3/3 repos verified)
 *        FAIL-LOST     hole material absent from archive of record AND history —
 *                      the owner-authority reset path is the only recovery
 *                      (documented; covered material is still custody-PUT-ed)
 *        FAIL-CUSTODY  operational failure (unopenable archive, PUT/verify fail,
 *                      chain-judge RPC dead) — retryable
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
import { refOf, R } from "../../scripts/refs.mjs"; // 3-c refs law: receipt of record speaks acct-NN refs

const STEEM_DIR = process.env.REC_STEEM_DIR || "steem-engine";
const API = "https://api.github.com/repos/roshpinacare-sys/";
const HOLES_RECEIPT = process.env.REC_HOLES_RECEIPT || "ops/fleet-rotation/receipt-A.json";
const RPCS = process.env.REC_RPC_JSON ? JSON.parse(process.env.REC_RPC_JSON) : {
  steem: ["https://api.steemit.com", "https://api.steemitdev.com", "https://steem.foxleycoin.com"],
  hive: ["https://api.hive.blog", "https://api.openhive.network", "https://hived.emre.sh"],
};

// house crypto helpers (same module fleet-rotation-a uses for chain-judges)
const P = (await import(path.resolve(import.meta.dirname, "../key-census-probe/probe.cjs"))).default;

function log(o) { console.log(typeof o === "string" ? o : JSON.stringify(o)); }
function pubFp(pub) { return String(pub).slice(0, 12); }
function sha256hex(buf) { return crypto.createHash("sha256").update(buf).digest("hex"); }

async function rpcFor(chain, method, params) {
  let lastErr = null;
  for (const url of RPCS[chain]) {
    try {
      const r = await fetch(url, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
        signal: AbortSignal.timeout(20000),
      });
      const j = await r.json();
      if (j.error) { lastErr = new Error(String(j.error.message || "rpc error").slice(0, 120)); continue; }
      return j.result;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("all rpc endpoints failed for " + chain);
}

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

/* decrypt a sealed archive with the ladder; returns {dec, passRef, innerSha16,
 * integrity} or null. inPath: ciphertext, expectInnerSha: pin or null. */
function openSealedArchive(inPath, meta, ladder, work, tag) {
  const dec = path.join(work, "keys-" + tag + ".zip");
  for (const pr of ladder) {
    let ok = false;
    try {
      execFileSync("openssl", ["enc", "-d", "-aes-256-cbc", "-pbkdf2", "-iter", "300000",
        "-in", inPath, "-out", dec, "-pass", "env:CUSTREC_PASS"],
        { env: { ...process.env, CUSTREC_PASS: pr.pass }, stdio: "pipe" });
      ok = fs.existsSync(dec) && fs.readFileSync(dec).subarray(0, 2).toString() === "PK";
    } catch { ok = false; }
    if (!ok) { try { fs.unlinkSync(dec); } catch {} continue; }
    const inner = fs.readFileSync(dec);
    const innerSha = sha256hex(inner);
    const integrity = meta && meta.keysZipInnerSha256
      ? (innerSha === meta.keysZipInnerSha256 ? "pinned-MATCH" : "pinned-MISMATCH")
      : "unpinned";
    return { dec, passRef: pr.ref, innerSha16: innerSha.slice(0, 16), integrity };
  }
  try { fs.unlinkSync(dec); } catch {}
  return null;
}

function unzipPayload(dec, extDir) {
  try {
    fs.rmSync(extDir, { recursive: true, force: true });
    fs.mkdirSync(extDir, { recursive: true });
    execFileSync("unzip", ["-o", "-q", dec, "-d", extDir], { stdio: "pipe" });
    return JSON.parse(fs.readFileSync(path.join(extDir, "rot2-keys.json"), "utf8"));
  } catch { return null; }
}

/* live chain-judge: every role's wif must derive to the LIVE on-chain authority */
async function chainJudge(chain, account, material) {
  const a = (await rpcFor(chain, "condenser_api.get_accounts", [[account]]))[0];
  if (!a) return { judge: "ABSENT-ON-CHAIN" };
  const roles = {};
  let all = true, any = false;
  for (const [role, m] of Object.entries(material || {})) {
    if (!m || !m.wif) { roles[role] = "ABSENT"; all = false; continue; }
    any = true;
    const want = role === "memo" ? a.memo_key : (a[role] || {}).key_auths?.[0]?.[0];
    const got = P.wifToPubSafe(m.wif);
    if (want && got && want === got) roles[role] = "LIVE-MATCH";
    else { roles[role] = "LIVE-MISMATCH"; all = false; }
  }
  if (!any) return { judge: "NO-MATERIAL", roles };
  return { judge: all ? "ALL-LIVE-MATCH" : "PARTIAL-MISMATCH", roles };
}

/* git history dig: prior seal commits' archive blobs (the estate's documented
 * archaeology path — "prior archives stay in git history" per meta v4). */
function sealCommits(metaKeysZipFile) {
  try {
    execFileSync("git", ["fetch", "--depth=30", "origin", "main"], { cwd: STEEM_DIR, stdio: "pipe" });
  } catch (e) { log({ historyDig: "deepen-failed", err: String(e.message || e).slice(0, 60) }); }
  const vaultDir = "agent/vault";
  let shas = [];
  for (const ref of ["origin/main", "HEAD"]) {
    try {
      shas = execFileSync("git", ["log", "--format=%H", "-n", "20", ref, "--", vaultDir],
        { cwd: STEEM_DIR, stdio: "pipe" }).toString().trim().split("\n").filter(Boolean);
      if (shas.length) break;
    } catch (e) { log({ historyDig: "log-fail", ref, err: String(e.message || e).slice(0, 50) }); }
  }
  // HEAD blob already tried — drop commits whose archive blob equals it
  let headBlob = "";
  for (const ref of ["origin/main", "HEAD"]) {
    try { headBlob = execFileSync("git", ["rev-parse", ref + ":" + metaKeysZipFile], { cwd: STEEM_DIR, stdio: "pipe" }).toString().trim(); if (headBlob) break; } catch {}
  }
  return shas.filter((s) => {
    try {
      const blob = execFileSync("git", ["rev-parse", s + ":" + metaKeysZipFile], { cwd: STEEM_DIR, stdio: "pipe" }).toString().trim();
      return blob !== headBlob;
    } catch { return false; }
  });
}

function writeReceipt(out, obj) { fs.writeFileSync(out, JSON.stringify(obj, null, 1) + "\n"); }

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
      // 3-c refs law: the receipt of record speaks acct-NN refs. Resolve the real
      // chain name env-side (FLEET_ROSTER_MAP) for chain/RPC/archive lookups; a
      // legacy real-name row passes through unchanged (back-compat); an unresolved
      // ref is a fail-closed ABORT — never fabricate a chain identity.
      const ref = String(a.account || "");
      const name = R(ref) || (/^acct-\d\d$/.test(ref) ? null : ref);
      if (!name) {
        log("ABORT: roster-unresolved for custody hole " + a.chain + ":" + ref + " — FLEET_ROSTER_MAP absent/unmapped (fail-closed, nothing touched)");
        process.exit(1);
      }
      holes.push({ chain: a.chain, account: name, ref, expect: a.newPubFp || {} });
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
  // display identity = the ref (estate-pseudonym law); h.account stays the real
  // chain name for RPC/archive lookups and the custody map keys (internal only).
  const refOfH = (h) => refOf(h.account);
  log({ custodyHoles: holes.length, list: holes.map((h) => h.chain + ":" + refOfH(h)).join(",") });

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
        holes: { total: holes.length, covered: 0, absent: holes.map((h) => h.chain + ":" + refOfH(h)), details: [] },
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
  const extDir = path.join(work, "x");

  const ladder = bundlePassLadder(meta);
  if (!ladder.length) {
    writeReceipt(receiptOut, { protocol: "SAOS-CUSTODY-RECOVER/1", at: startedAt, verdict: "FAIL-CUSTODY",
      holes: { total: holes.length, covered: 0, absent: [], details: [] },
      error: "no usable unlock passes (bundle ladder empty)", source: { archive: encRel } });
    log({ VERDICT: "FAIL-CUSTODY", reason: "empty pass ladder" });
    process.exit(1);
  }
  const opened = openSealedArchive(encPath, meta, ladder, work, "head");
  const tried = [{ archive: encRel, openedWith: opened ? opened.passRef : null }];
  if (!opened) {
    writeReceipt(receiptOut, { protocol: "SAOS-CUSTODY-RECOVER/1", at: startedAt, verdict: "FAIL-CUSTODY",
      holes: { total: holes.length, covered: 0, absent: [], details: [] },
      error: "ROT2 archive of record unopenable with any ladder pass", source: { archive: encRel } });
    log({ VERDICT: "FAIL-CUSTODY", reason: "archive unopenable", tried: tried.map((t) => t.archive).join(",") });
    process.exit(1);
  }
  log({ archive: encRel, openedWith: opened.passRef, innerSha16: opened.innerSha16, integrity: opened.integrity });

  // 3) unzip + parse the material bundle (plaintext lives only in 0700 /tmp)
  let payload = unzipPayload(opened.dec, extDir);
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
  let custodyMap = JSON.parse(JSON.stringify(payload.accounts)); // the recoverable map so far
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
    if (full) covered++; else absent.push(h);
    details.push({ chain: h.chain, account: refOfH(h), inArchive: !!mat, verifiedBy: mat ? "receipt-newPubFp" : null, roles });
  }
  log({ archiveCoverage: { holes: holes.length, covered, absent: absent.map((h) => h.chain + ":" + refOfH(h)).join(",") || "none" } });

  // 5) history dig for holes absent from the archive of record (live chain-judge)
  const historyDug = [];
  let rpcDead = false;
  if (absent.length) {
    const commits = sealCommits(encRel);
    log({ historyDig: "start", candidateSealCommits: commits.length, absent: absent.map((h) => h.chain + ":" + refOfH(h)).join(",") });
    for (const sha of commits) {
      if (!absent.length) break;
      let digMeta = null, blobPath = "";
      try {
        digMeta = JSON.parse(execFileSync("git", ["show", sha + ":agent/recovery-meta.json"], { cwd: STEEM_DIR, stdio: "pipe", maxBuffer: 16 * 1024 * 1024 }).toString());
        blobPath = digMeta.keysZipFile || encRel;
        const blob = execFileSync("git", ["show", sha + ":" + blobPath], { cwd: STEEM_DIR, stdio: "pipe", maxBuffer: 64 * 1024 * 1024 });
        blobPath = path.join(work, "hist-" + sha.slice(0, 8) + ".zip.enc");
        fs.writeFileSync(blobPath, blob);
      } catch (e) { log({ historyDig: "extract-fail", commit: sha.slice(0, 8), err: String(e.message || e).slice(0, 60) }); continue; }
      const digOpened = openSealedArchive(blobPath, digMeta, ladder, work, "hist-" + sha.slice(0, 8));
      if (!digOpened) { log({ historyDig: "unopenable", commit: sha.slice(0, 8) }); continue; }
      const digPayload = unzipPayload(digOpened.dec, path.join(work, "xh-" + sha.slice(0, 8)));
      if (!digPayload || !digPayload.accounts) { log({ historyDig: "parse-fail", commit: sha.slice(0, 8) }); continue; }
      log({ historyDig: "opened", commit: sha.slice(0, 8), openedWith: digOpened.passRef, innerSha16: digOpened.innerSha16, integrity: digOpened.integrity });
      for (const h of [...absent]) {
        const mat = (digPayload.accounts[h.chain] || {})[h.account] || null;
        if (!mat) continue;
        let judge;
        try { judge = await chainJudge(h.chain, h.account, mat); } catch (e) {
          rpcDead = true;
          log({ historyDig: "rpc-fail", hole: h.chain + ":" + refOfH(h), err: String(e.message || e).slice(0, 60) });
          continue;
        }
        if (judge.judge !== "ALL-LIVE-MATCH") {
          log({ historyDig: "judge-reject", hole: h.chain + ":" + refOfH(h), judge: judge.judge });
          continue;
        }
        custodyMap[h.chain] = custodyMap[h.chain] || {};
        custodyMap[h.chain][h.account] = mat;
        covered++; absent.splice(absent.indexOf(h), 1);
        const det = details.find((d) => d.chain === h.chain && d.account === refOfH(h));
        if (det) { det.inArchive = true; det.verifiedBy = "live-chain-judge@" + sha.slice(0, 8); det.roles = Object.fromEntries(Object.keys(mat).map((r) => [r, { status: "LIVE-MATCH", pubFp: mat[r] && mat[r].pub ? pubFp(mat[r].pub) : null }])); }
        historyDug.push({ chain: h.chain, account: refOfH(h), fromCommit: sha.slice(0, 8), fromArchive: blobPath ? digMeta.keysZipFile : "?", openedWith: digOpened.passRef, integrity: digOpened.integrity, judge: judge.judge, roles: Object.keys(mat) });
        log({ historyDig: "RECOVERED", hole: h.chain + ":" + refOfH(h), fromCommit: sha.slice(0, 8), judge: judge.judge });
      }
      try { execFileSync("shred", ["-u", digOpened.dec], { stdio: "pipe" }); } catch {}
    }
    log({ historyDig: { recovered: historyDug.length, stillAbsent: absent.map((h) => h.chain + ":" + refOfH(h)).join(",") || "none" } });
  }
  const custodyAccounts = Object.values(custodyMap).reduce((n, m) => n + Object.keys(m).length, 0);

  // 6) custody PUT — recoverable map (never partial-masquerading: the receipt
  //    carries the absent list and the verdict stays FAIL-LOST while holes remain)
  const custodyRes = [];
  if (covered > 0) {
    for (const repo of ["steem", "saos-runtime", "Domain"]) {
      const entry = { repo, put: "FAIL", verified: false, accountsInPayload: custodyAccounts };
      try {
        const pkr = await fetch(API + repo + "/actions/secrets/public-key", { headers: H });
        if (!pkr.ok) throw new Error("pk HTTP " + pkr.status);
        const pk = await pkr.json();
        const sealed = sodium.crypto_box_seal(
          Buffer.from(JSON.stringify({ rot2: custodyMap, at: payload.at || startedAt, recoveredBy: "custody-recover 2-a" })),
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
        } catch { entry.verified = false; }
        if (!entry.verified && attempt === 0) await new Promise((r) => setTimeout(r, 4000));
      }
    }
    log({ custody: custodyRes.map((c) => c.repo + "=" + c.put + (c.verified ? "+verified" : "-unverified") + "(" + c.accountsInPayload + " accounts)").join(" ") });
  } else {
    log({ custody: "WITHHELD", reason: "no recoverable hole material in archive of record or history" });
  }

  // 7) verdict law (honest)
  const allPutOk = custodyRes.length > 0 && custodyRes.every((c) => c.put === "OK" && c.verified);
  let verdict;
  if (covered === holes.length && allPutOk) verdict = "PASS";
  else if (covered < holes.length && !rpcDead) verdict = "FAIL-LOST";
  else verdict = "FAIL-CUSTODY";
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
      accountsInArchive: totalAccounts,
      historyDug,
    },
    holes: { total: holes.length, covered, absent: absent.map((h) => h.chain + ":" + refOfH(h)), details },
    custody: {
      secret: "ROT2_FLEET_KEYS",
      repos: custodyRes,
      design: "whole recoverable map in one sealed PUT per repo (T-68 design; per-account last-wins flaw retired); absent holes stay documented here, never silently dropped",
    },
    verdict,
    laws: [
      "zero key material in receipt/logs — pub fingerprints (12-char) + sha prefixes only",
      "pass values env-only + masked, never logged",
      "plaintext confined to 0700 /tmp, shredded after use",
      "HEAD-archive material verified vs receipt newPubFp; history-dug material verified vs LIVE chain authorities",
      "custody PUT carries the recoverable set; absent holes keep the verdict red (FAIL-LOST) with the owner-authority reset path documented",
      "estate-pseudonym law (3-c): this receipt speaks acct-NN refs only; chain identities resolved env-side from FLEET_ROSTER_MAP (fail-closed), never written",
    ],
  };
  if (verdict === "FAIL-LOST" || absent.length) {
    receipt.recoveryPath = "owner-authority reset is the only recovery for: " +
      (absent.map((h) => h.chain + ":" + refOfH(h)).join(",") || "none") +
      " — owner keys were untouched in phase A by law, so owner-signed re-adoption/rotation (owner-key-adopt lane) can restore these accounts; no usable material for them exists in the archive of record or its history";
  }
  writeReceipt(receiptOut, receipt);
  log({ VERDICT: verdict, holes: holes.length, covered, absent: absent.map((h) => h.chain + ":" + refOfH(h)).join(",") || "none" });

  // 8) shred plaintext, exit by verdict
  try { execFileSync("shred", ["-u", opened.dec], { stdio: "pipe" }); } catch { try { fs.unlinkSync(opened.dec); } catch {} }
  try { fs.rmSync(work, { recursive: true, force: true }); } catch {}
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
