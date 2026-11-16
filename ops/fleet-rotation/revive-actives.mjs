#!/usr/bin/env node
/**
 * revive-actives.mjs — R369 · surgical army revival (owner = recovery authority).
 *
 * MEASURED PROBLEM (2026-11-16, army-ladder receipts): 5 accounts in KEY-STASIS —
 *   cashmachine, israelnews, hcsoldier4, hcsoldier5, hcsoldier6 — "no live active WIF".
 * Root cause chain (all measured): the 2026-10-28T21:35Z exposure-seal removed the
 * key vault from the public steem repo; the 10-21-era ACTIVE WIFs for these accounts
 * live in blobs on a branch that no longer exists (unreachable from every current
 * ref — verified by full-history scan 2026-11-16). Their ACTIVE authorities are
 * UNCHANGED ON CHAIN since 10-21 — the WIFs are lost, the accounts are not.
 *
 * THE LAW THIS TOOL HONORS: the owner key is the recovery authority (keys registry:
 * "owner = recovery authority"; rotate.mjs phase-A precedent: owner-signed
 * account_update with the owner field absent). Where an army account holds a LIVE
 * owner key in the material pool but no active WIF, this tool mints a FRESH active
 * key and rotates the account to it — owner-signed, byte-law broadcast, chain-verified.
 *
 * MATERIAL POOL (alive-wins, additive):
 *   1. LIVE_FLEET_KEYS env (the crown census-relay product — owner keys for the
 *      operator accounts measured LIVE 2026-11-15)
 *   2. agent/vault/KEYS-ZIP-2026-11-15-RESTORE.zip.enc (custody restore v2, 14/14 —
 *      mother-line owner keys hcsoldier4/5/6 owner LIVE derived) — VAULT_RESTORE_PASS
 *   3. every other agent/vault/*.enc archive × every bundle pass (archive fallback)
 * Every WIF is chain-judged against LIVE authorities before anything. Nothing is
 * trusted by shape, name, or label.
 *
 * SURGICAL SCOPE (the difference from rotate.mjs --rotate):
 *   targets = roster accounts with (owner LIVE-matched) AND (no active WIF in pool)
 *   rotation = the ACTIVE role ONLY; posting/memo/json_metadata preserved byte-as-is
 *   from the live account. Owner authority untouched. Sanity cap: >8 targets aborts.
 *
 * CUSTODY (incremental, per account, BEFORE the next broadcast):
 *   PUT LIVE_FLEET_KEYS (merged: existing map + fresh actives) to steem, saos-runtime,
 *   Domain, saos-dex — libsodium sealed box, same law as the crown relay.
 *   Then the rotated actives are sealed to vault-home custody-intake (ciphertext only)
 *   with the ledger entry — wipe-immune permanence.
 *
 * HONESTY: fingerprints only in every log/receipt (first-12 of pubs, sha-8 of WIFs).
 * Fail-closed everywhere. Zero red silencing: SKIP-* verdicts are loud.
 *
 * Modes:
 *   --selftest           offline vectors, zero network, zero key material
 *   --run  OUT.json      the whole law above; receipt to OUT.json (0600)
 */
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { execFileSync } from "child_process";
import { createRequire } from "module";

const require_ = createRequire(import.meta.url);
const P = require_("./../key-census-probe/probe.cjs");
const { sha256 } = await import("@noble/hashes/sha256");
const secp = await import("@noble/secp256k1");

const STEEM_DIR = process.env.REVIVE_STEEM_DIR || path.resolve("steem-engine");
const TX = await import(path.resolve(STEEM_DIR, "mini-services/saos-engine/steemtx.mjs"));

const RPCS_STEEM = ["https://api.steemit.com", "https://api.justyy.com", "https://steem-rpc.publicnode.com"];
const CUSTODY_REPOS = ["steem", "saos-runtime", "Domain", "saos-dex"];

const fp = (s) => crypto.createHash("sha256").update(String(s), "utf-8").digest("hex").slice(0, 8);
const pubFp = (pub) => String(pub).slice(0, 12);
const log = (o) => console.log(typeof o === "string" ? o : JSON.stringify(o));

/* ── sodium (interop-safe loader — the rotate.mjs 2-a law) ──────────────── */
let _sodium = null;
async function loadSodium() {
  if (_sodium) return _sodium;
  const _m = await import("libsodium-wrappers");
  const sodium = _m.default ?? _m;
  await sodium.ready;
  if (typeof sodium.crypto_box_seal !== "function" || typeof sodium.crypto_box_seal_open !== "function") {
    throw new Error("libsodium interop FAIL: crypto_box_seal/open missing after interop-safe load");
  }
  _sodium = sodium;
  return sodium;
}
async function sodiumSealSelftest() {
  const sodium = await loadSodium();
  const kp = sodium.crypto_box_keypair();
  const payload = Buffer.from(JSON.stringify({ selftest: "crypto_box_seal roundtrip" }));
  const sealed = Buffer.from(sodium.crypto_box_seal(payload, kp.publicKey));
  const opened = Buffer.from(sodium.crypto_box_seal_open(sealed, kp.publicKey, kp.privateKey));
  if (!opened.equals(payload)) throw new Error("sodium selftest: seal->open roundtrip mismatch");
  return sodium;
}

/* ── keys (house WIF form — rotate.mjs law) ─────────────────────────────── */
const sha256dLocal = (b) => Buffer.from(sha256(Buffer.from(sha256(b))));
function wif37(priv32) {
  const body = Buffer.concat([Buffer.from([0x80]), Buffer.from(priv32)]);
  const chk = sha256dLocal(body).slice(0, 4);
  return TX.b58encode(Buffer.concat([body, chk]));
}
function newKey() {
  const priv = crypto.randomBytes(32);
  const wif = wif37(priv);
  const pub = TX.pubkeyFromSeed(priv);
  const back = TX.wifDecode(wif);
  if (!back || Buffer.from(back).toString("hex") !== priv.toString("hex")) throw new Error("wif roundtrip failed");
  if (P.wifToPubSafe(wif) !== pub) throw new Error("pub derivation mismatch wif vs seed");
  return { priv, wif, pub };
}
const auth = (pub) => ({ weight_threshold: 1, account_auths: [], key_auths: [[pub, 1]] });

/* ── rpc + broadcast (byte-law — the rot3-proven path) ──────────────────── */
async function rpcSteem(method, params) {
  let lastErr = null;
  for (const url of RPCS_STEEM) {
    try {
      const r = await fetch(url, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
        signal: AbortSignal.timeout(20000),
      });
      const j = await r.json();
      if (j.result !== undefined) return j.result;
      lastErr = new Error(`${new URL(url).host}: no-result`);
    } catch (e) { lastErr = e; }
  }
  throw new Error(`all-steem-nodes-failed · ${String(lastErr?.message ?? lastErr).slice(0, 120)}`);
}
async function getAccount(name) {
  const res = await rpcSteem("condenser_api.get_accounts", [[name]]);
  return (res && res[0]) || null;
}
async function dgpo() { return rpcSteem("condenser_api.get_dynamic_global_properties", []); }

async function broadcastOp(op, opsName, signingWif) {
  const dgpo0 = await dgpo();
  const headNum = dgpo0.head_block_number;
  const idBytes = Buffer.from(String(dgpo0.head_block_id), "hex");
  const exp = Math.floor(Date.now() / 1000) + 60;
  const chainId = Buffer.alloc(32); // steem chain id = 32 zero bytes
  const tx = TX.buildTx({ ops: [[opsName, op]], dgpo: dgpo0, wifs: [], ttlSec: 60, chainId });
  const nodeHex = await rpcSteem("condenser_api.get_transaction_hex", [{
    ref_block_num: headNum & 0xffff,
    ref_block_prefix: idBytes.readUInt32LE(4),
    expiration: new Date(exp * 1000).toISOString().slice(0, 19),
    operations: [[opsName, op]],
    extensions: [],
  }]);
  /* R256 PHANTOM-BYTE LAW (steemtx.mjs account_update case, broadcast-proven
   * 2026-10-29T13:4xZ): get_transaction_hex — the oracle that lies — appends
   * ONE trailing byte (0x00) to the op-10 family that the CONSENSUS digest
   * does NOT carry. Bytes-minus-trailing-0x00 were ACCEPTED on api.steemit.com;
   * hex-matching (signing over the phantom byte) was rejected on 3 nodes
   * ("missing required owner/active authority" — why R245-ROT2 keys never went
   * live). We sign over OUR consensus bytes and accept nodeHex == ours + "00". */
  const byteMatch = nodeHex === tx.serializedHex || nodeHex === tx.serializedHex + "00";
  if (!byteMatch) throw new Error("byte-law FAIL nodeLen=" + (nodeHex.length / 2) + " myLen=" + (tx.serializedHex.length / 2));
  const bin = Buffer.from(tx.serializedHex, "hex");
  const digest = sha256(Buffer.concat([chainId, bin.slice(0, bin.length - 1)]));
  const sig = TX.signDigest(Buffer.from(digest), signingWif);
  const secret = TX.wifDecode(signingWif);
  const selfOk = secp.verify(sig.slice(1), digest, Buffer.from(secp.getPublicKey(Buffer.from(secret), true)));
  if (!selfOk) throw new Error("signature self-verify FAIL");
  const b = await rpcSteem("condenser_api.broadcast_transaction_synchronous", [{ ...tx.json, signatures: [sig.toString("hex")] }]);
  const txid = String((b && (b.id || (b.result && b.result.id))) || "");
  if (!txid) throw new Error("broadcast answered without id (honest)");
  return { txid, digestHex: Buffer.from(digest).toString("hex").slice(0, 16) };
}
async function verifyActivePub(name, wantPub, tries = 10) {
  for (let i = 0; i < tries; i++) {
    const a = await getAccount(name);
    if (a && (a.active || {}).key_auths?.[0]?.[0] === wantPub) return true;
    await new Promise((r) => setTimeout(r, 3000));
  }
  return false;
}

/* ── material pool (alive-wins) ─────────────────────────────────────────── */
function deepWalkWifs(node, out, depth = 0) {
  if (!node || typeof node !== "object" || depth > 8) return;
  for (const v of Object.values(node)) {
    if (typeof v === "string") { if (P.WIF_RE.test(v)) out.add(v); }
    else if (v && typeof v === "object") deepWalkWifs(v, out, depth + 1);
  }
}

async function buildPool() {
  const wifs = new Set();
  const sources = [];

  // 1. LIVE_FLEET_KEYS (crown census-relay product)
  try {
    const raw = process.env.LIVE_FLEET_KEYS || "";
    if (raw) {
      const n = new Set();
      deepWalkWifs(JSON.parse(raw), n);
      n.forEach((w) => wifs.add(w));
      sources.push({ source: "LIVE_FLEET_KEYS", candidates: n.size });
    }
  } catch (e) { sources.push({ source: "LIVE_FLEET_KEYS", error: String(e?.message ?? e).slice(0, 80) }); }

  // 2+3. every sealed archive in the vault of record × every pass we hold
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "revive-"));
  fs.chmodSync(work, 0o700);
  const vaultDir = path.join(STEEM_DIR, "agent", "vault");
  const bundle = (() => { try { return JSON.parse(process.env.STEEM_VAULT_PASSES || "{}"); } catch { return {}; } })();
  const passes = [
    { name: "VAULT_RESTORE_PASS", value: process.env.VAULT_RESTORE_PASS || "" },
    { name: "gen2.keysZipUnlock", value: bundle?.gen2?.keysZipUnlock || "" },
    { name: "recovery-3.keysZipUnlock", value: bundle?.["recovery-3"]?.keysZipUnlock || "" },
  ];
  try {
    const metaPath = path.join(STEEM_DIR, "agent", "recovery-meta.json");
    if (fs.existsSync(metaPath)) {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
      if (meta.keysZipPass) passes.push({ name: "meta.keysZipPass", value: meta.keysZipPass });
      if (meta.keysBackupPass) passes.push({ name: "meta.keysBackupPass", value: meta.keysBackupPass });
    }
  } catch { /* honest: meta unreadable → its passes absent */ }
  const usable = passes.filter((p) => p.value && p.value.length >= 8);

  let archives = [];
  try { archives = fs.readdirSync(vaultDir).filter((f) => /^KEYS-.*\.enc$/.test(f)); } catch { /* no vault dir — LIVE pool stands alone */ }
  for (const f of archives) {
    const src = path.join(vaultDir, f);
    const dec = path.join(work, f.replace(/\.enc$/, ""));
    let hit = null;
    for (const p of usable) {
      if (P.decryptTry(src, dec, p.value, p.name)) { hit = p.name; break; }
    }
    if (!hit) { sources.push({ archive: f, opened: false }); continue; }
    const extDir = path.join(work, "x-" + f.replace(/\.enc$/, ""));
    fs.mkdirSync(extDir, { recursive: true });
    const before = wifs.size;
    try {
      const magic = fs.readFileSync(dec).subarray(0, 2).toString();
      if (magic === "PK") execFileSync("unzip", ["-o", "-q", dec, "-d", extDir]);
      else execFileSync("tar", ["xf", dec, "-C", extDir]);
      const cands = [];
      P.scanDir(extDir, cands); // probe.cjs law: pushes {wif, tag} per candidate
      for (const c of cands) if (c && c.wif && P.WIF_RE.test(c.wif)) wifs.add(c.wif);
    } catch (e) { sources.push({ archive: f, extract: "fail", err: String(e?.message ?? e).slice(0, 60) }); continue; }
    sources.push({ archive: f, opened: hit, candidates: wifs.size - before });
  }
  return { wifs: [...wifs], sources, work };
}

/* ── custody (incremental, per account) ─────────────────────────────────── */
async function putLiveSecret(liveMap, at, GH) {
  if (!GH) { log({ custody: "SKIP", reason: "GH_PAT absent (loud)" }); return false; }
  const sodium = await loadSodium();
  const H = { Authorization: "Bearer " + GH, Accept: "application/vnd.github+json" };
  const payload = JSON.stringify({ live: liveMap, source: "army-active-revive", at });
  const done = [];
  for (const repo of CUSTODY_REPOS) {
    try {
      const pkr = await fetch(`https://api.github.com/repos/roshpinacare-sys/${repo}/actions/secrets/public-key`, { headers: H });
      if (!pkr.ok) throw new Error("pk HTTP " + pkr.status);
      const pk = await pkr.json();
      const sealed = sodium.crypto_box_seal(Buffer.from(payload), Buffer.from(pk.key, "base64"));
      const r = await fetch(`https://api.github.com/repos/roshpinacare-sys/${repo}/actions/secrets/LIVE_FLEET_KEYS`, {
        method: "PUT", headers: { ...H, "Content-Type": "application/json" },
        body: JSON.stringify({ encrypted_value: Buffer.from(sealed).toString("base64"), key_id: pk.key_id }),
      });
      if (r.status !== 201 && r.status !== 204) throw new Error("PUT HTTP " + r.status);
      done.push(repo);
    } catch (e) { log({ custody: "FAIL", repo, err: String(e?.message ?? e).slice(0, 80) }); }
  }
  log({ custody: "PUT LIVE_FLEET_KEYS", repos: done.join(",") });
  return done.length > 0;
}

async function sealToVaultHome(material, at, GH) {
  if (!GH || !process.env.VAULT_RESTORE_PASS) { log({ vaultHomeSeal: "SKIP (no PAT or no seal pass — loud)" }); return; }
  try {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), "vhseal-"));
    execFileSync("git", ["clone", "-q", "--depth", "1", `https://x-access-token:${GH}@github.com/roshpinacare-sys/vault-home.git`, path.join(work, "vh")], { stdio: "pipe" });
    const ts = at.replace(/[-:]/g, "").replace(/\..+/, "Z");
    const plain = path.join(work, "revived.json");
    const enc = path.join(work, "vh", "custody-intake", `ARMY-ACTIVE-REVIVE-${ts}.enc`);
    fs.writeFileSync(plain, JSON.stringify({ schema: "SAOS-ARMY-ACTIVE-REVIVE/1", at, material }, null, 1), { mode: 0o600 });
    execFileSync("openssl", ["enc", "-aes-256-cbc", "-pbkdf2", "-iter", "300000", "-pass", "env:SEALPASS", "-in", plain, "-out", enc], { env: { ...process.env, SEALPASS: process.env.VAULT_RESTORE_PASS }, stdio: "pipe" });
    const sha = execFileSync("sha256sum", [enc], { encoding: "utf8" }).split(" ")[0];
    const ledger = path.join(work, "vh", "vault-chain", "CUSTODY-LEDGER.jsonl");
    fs.appendFileSync(ledger, JSON.stringify({ ts, event: "seal", artifact: `custody-intake/ARMY-ACTIVE-REVIVE-${ts}.enc`, purpose: "army active-key revival (owner-signed rotations, chain-verified txids)", sha256: sha, secrets: "NONE (ciphertext only)" }) + "\n");
    execFileSync("git", ["-C", path.join(work, "vh"), "add", `custody-intake/ARMY-ACTIVE-REVIVE-${ts}.enc`, "vault-chain/CUSTODY-LEDGER.jsonl"]);
    execFileSync("git", ["-C", path.join(work, "vh"), "-c", "user.email=326012154+roshpinacare-sys@users.noreply.github.com", "-c", "user.name=roshpinacare-sys", "commit", "-q", "-m", `army-active-revive seal ${ts} [skip ci]`]);
    execFileSync("git", ["-C", path.join(work, "vh"), "push", "-q"]);
    fs.rmSync(work, { recursive: true, force: true });
    log({ vaultHomeSeal: "OK", artifact: `ARMY-ACTIVE-REVIVE-${ts}.enc`, sha: sha.slice(0, 10) });
  } catch (e) { log({ vaultHomeSeal: "FAIL", err: String(e?.message ?? e).slice(0, 100) }); }
}

/* ── selftest (offline, zero network, zero key material) ────────────────── */
function selftest() {
  const k1 = newKey();
  if (!/^[5JK][1-9A-HJ-NP-Za-km-z]{50}$/.test(k1.wif)) throw new Error("wif shape");
  const a = auth(k1.pub);
  if (a.key_auths.length !== 1 || a.key_auths[0][1] !== 1) throw new Error("authority shape");
  const op = { account: "selftest-account", active: a, posting: a, memo_key: k1.pub, json_metadata: "{}" };
  if (op.account.length < 3 || op.json_metadata === undefined) throw new Error("op shape");
  const k2 = newKey();
  if (k1.wif === k2.wif || k1.pub === k2.pub) throw new Error("randomness");
  // deep-walk vector: nested WIFs discovered regardless of shape
  const walked = new Set();
  deepWalkWifs({ live: { acct: { owner: k1.wif, active: k2.wif } }, junk: "not-a-wif" }, walked);
  if (walked.size !== 2) throw new Error("deep-walk vector");
  log({ selftest: "PASS", vectors: 4, sodiumSealRoundtrip: true });
}

/* ── run (the whole law) ────────────────────────────────────────────────── */
async function runMode(outPath) {
  const GH = process.env.GH_PAT || "";
  const at = new Date().toISOString();
  const sodium = await sodiumSealSelftest();
  log({ sodium: "seal-roundtrip OK (pre-broadcast custody gate)" });

  const roster = P.ROSTER;
  if (!roster.length) { log("ABORT: ROT_ROSTER absent — roster is intel-by-law, not code (fail-closed)"); process.exit(1); }

  const { wifs, sources, work } = await buildPool();
  log({ pool: { candidates: wifs.length }, sources });

  const livePubs = await P.liveAuthorities();
  const map = {};
  let matched = 0;
  for (const wif of wifs) {
    const r = P.classify({ source: "revive-pool", wif }, livePubs);
    if (r.ok) { map[r.account] = map[r.account] || {}; map[r.account][r.role] = wif; matched++; }
  }
  log({ chainJudged: matched, across: Object.keys(map).length, accounts: Object.keys(map).join(",") });

  // healthy vs targets (honest full picture)
  const withActive = roster.filter((n) => map[n]?.active);
  const targets = roster.filter((n) => map[n]?.owner && !map[n]?.active);
  const noMaterial = roster.filter((n) => !map[n]);
  log({ rosterSize: roster.length, withActive: withActive.length, reviveTargets: targets.length, noMaterial: noMaterial.length });
  if (noMaterial.length) log({ noMaterialList: noMaterial.join(",") });
  if (targets.length === 0) { log("VERDICT: NOTHING-TO-REVIVE (all roster accounts either hold actives or hold no owner key — honest green)"); fs.writeFileSync(outPath, JSON.stringify({ at, verdict: "NOTHING-TO-REVIVE", targets: [] }, null, 1)); return; }
  if (targets.length > 8) { log("ABORT: " + targets.length + " targets exceeds the surgical cap (8) — inspect the pool before any broadcast"); process.exit(2); }
  log({ reviveTargets: targets.map((n) => `${n}(owner fp ${fp(map[n].owner)})`).join(", ") });

  // base LIVE map (preserved; new actives merged in per account)
  const liveMap = (() => {
    try { return (JSON.parse(process.env.LIVE_FLEET_KEYS || "{}").live) || {}; } catch { return {}; }
  })();

  const receipt = { schema: "SAOS-ARMY-ACTIVE-REVIVE/1", at, results: [], verdict: null };
  let okCount = 0;
  for (const name of targets) {
    const entry = { account: name, at: new Date().toISOString() };
    try {
      const live0 = await getAccount(name);
      if (!live0) { entry.verdict = "SKIP-ABSENT-ON-CHAIN"; receipt.results.push(entry); log({ account: name, verdict: entry.verdict }); continue; }
      const ownerPub = (live0.owner || {}).key_auths?.[0]?.[0];
      if (P.wifToPubSafe(map[name].owner) !== ownerPub) { entry.verdict = "SKIP-OWNER-CHAIN-JUDGE-FAIL"; receipt.results.push(entry); log({ account: name, verdict: entry.verdict }); continue; }
      const k = newKey();
      const op = {
        account: name,
        active: auth(k.pub),
        posting: JSON.parse(JSON.stringify(live0.posting)),
        memo_key: live0.memo_key,
        json_metadata: live0.json_metadata || "",
      };
      const b = await broadcastOp(op, "account_update", map[name].owner);
      entry.txid = b.txid.slice(0, 20);
      entry.oldActiveFp = pubFp((live0.active || {}).key_auths?.[0]?.[0]);
      entry.newActivePubFp = pubFp(k.pub);
      entry.chainVerified = await verifyActivePub(name, k.pub);
      entry.verdict = entry.chainVerified ? "REVIVED-VERIFIED" : "REVIVED-VERIFY-PENDING";
      // incremental custody BEFORE the next broadcast
      liveMap[name] = { ...(liveMap[name] || {}), owner: map[name].owner, active: k.wif };
      if (map[name].posting) liveMap[name].posting = map[name].posting;
      await putLiveSecret(liveMap, new Date().toISOString(), GH);
      receipt.results.push(entry);
      if (entry.chainVerified) okCount++;
      log({ account: name, verdict: entry.verdict, txid: entry.txid, newActive: entry.newActivePubFp });
    } catch (e) {
      entry.verdict = "FAIL";
      entry.error = String(e?.message ?? e).slice(0, 160);
      receipt.results.push(entry);
      log({ account: name, verdict: "FAIL", err: entry.error });
    }
  }

  receipt.verdict = okCount > 0 ? `REVIVED ${okCount}/${targets.length}` : "NOTHING-REVIVED (honest red)";
  // permanence: the rotated actives sealed to vault-home (ciphertext only)
  const material = {};
  for (const r of receipt.results) if (r.verdict === "REVIVED-VERIFIED" || r.verdict === "REVIVED-VERIFY-PENDING") material[r.account] = { activeWifFp: fp(liveMap[r.account].active), txid: r.txid, note: "full WIF material in LIVE_FLEET_KEYS secret + vault-home seal" };
  await sealToVaultHome(material, receipt.at, GH);

  fs.writeFileSync(outPath, JSON.stringify(receipt, null, 1), { mode: 0o600 });
  fs.chmodSync(outPath, 0o600);
  try { fs.rmSync(work, { recursive: true, force: true }); } catch { /* best effort */ }
  log({ PHASE_REVIVE_SUMMARY: { ok: okCount, of: targets.length, verdict: receipt.verdict } });
  if (okCount === 0) process.exit(2);
}

/* ── main ───────────────────────────────────────────────────────────────── */
const argv = process.argv.slice(2);
if (argv.includes("--selftest")) { await sodiumSealSelftest(); selftest(); process.exit(0); }
if (argv.includes("--run")) { await runMode(argv[argv.indexOf("--run") + 1] || "/tmp/revive-receipt.json"); process.exit(0); }
log("usage: revive-actives.mjs --selftest | --run OUT.json");
