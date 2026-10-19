// hive-revival.mjs — self-contained runner-side custody revival (fail-closed).
// Judges EVERY runner-held secret + the sha-pinned GEN-1 vault against the LIVE
// chain authorities; if a live HIVE posting authority is held, signs ONE
// posting-only saos.weave.v1 heartbeat and emits the SIGNED tx. Zero secrets out.
import * as fs from "node:fs";
import * as crypto from "node:crypto";
import * as os from "node:os";
import { execFileSync } from "node:child_process";
import { sha256 } from "@noble/hashes/sha256";
import { ripemd160 } from "@noble/hashes/ripemd160";
import { hmac } from "@noble/hashes/hmac";
import * as secp from "@noble/secp256k1";
import bs58 from "bs58";

const concat = (...b) => { const t = b.reduce((n, x) => n + x.length, 0); const o = new Uint8Array(t); let k = 0; for (const x of b) { o.set(x, k); k += x.length; } return o; };
const kw = secp.etc ?? secp.utils;
kw.hmacSha256Sync = (key, ...m) => hmac(sha256, key, concat(...m));
kw.hmacSha256Async = async (key, ...m) => hmac(sha256, key, concat(...m));

const sha256d = (b) => crypto.createHash("sha256").update(crypto.createHash("sha256").update(b).digest()).digest();
const VAULT_FILE_LIST = ["KEYS-ZIP-2026-09-10.zip.enc","KEYS-ZIP-2026-10-07.zip.enc","KEYS-ZIP-2026-10-08.zip.enc","KEYS-ZIP-2026-10-08-ROT3.zip.enc","KEYS-ZIP-2026-10-08-ROT4.zip.enc","KEYS-ZIP-2026-10-12-MASTER.zip.enc","KEYS-BACKUP-2026-09-09.tar.enc","KEYS-SEED-2026-10-04.zip.enc","EXTRA-SECRETS-2026-10-08-ROT4.zip.enc","ABSORB-2026-10-08T18-23-50.zip.enc","ABSORB-2026-10-08T18-27-38.zip.enc"];
const allOpenedTexts = [];
async function unwrap(buf, tag, depth, found) {
  if (depth > 6 || buf.length < 30 || buf.length > 40 * 1024 * 1024) { if (buf.length >= 30) found.push([tag, buf.toString("latin1")]); return; }
  const b = buf;
  const isZip = b.subarray(0, 2).toString() === "PK";
  const isGz = b[0] === 0x1f && b[1] === 0x8b;
  const isTar = b.subarray(257, 262).toString() === "ustar";
  const isSalted = b.subarray(0, 6).toString() === "Salted";
  const isB64 = b.length > 100 && /^([A-Za-z0-9+/=\r\n]+)$/.test(b.subarray(0, Math.min(b.length, 400)).toString("latin1"));
  const t0 = fs.mkdtempSync(os.tmpdir() + "/uw-");
  try {
    if (isZip) {
      fs.writeFileSync(`${t0}/a.zip`, b);
      execFileSync("unzip", ["-o", "-q", `${t0}/a.zip`, "-d", `${t0}/o`]);
      const walk = (p) => { for (const e of fs.readdirSync(p, { withFileTypes: true })) { const f2 = p + "/" + e.name; if (e.isDirectory()) walk(f2); else found.push([`${tag}>${e.name}`, fs.readFileSync(f2).toString("latin1")]); } };
      walk(`${t0}/o`);
      return;
    }
    if (isGz) {
      const out = execFileSync("gunzip", { input: b, maxBuffer: 64 * 1024 * 1024 });
      await unwrap(out, `${tag}>gz`, depth + 1, found);
      return;
    }
    if (isTar) {
      fs.writeFileSync(`${t0}/a.tar`, b);
      // W11 fix (measured 2026-10-19, ×8 red/24h): tar does NOT auto-create the
      // -C target (unzip -d does) → "tar: /tmp/uw-*/o: Cannot open" → every .tar
      // bundle (KEYS-BACKUP-2026-09-09.tar.enc) silently skipped → "no live hive
      // posting authority" false alarm. One line, mechanical, no semantics change.
      fs.mkdirSync(`${t0}/o`, { recursive: true });
      execFileSync("tar", ["-xf", `${t0}/a.tar`, "-C", `${t0}/o`]);
      const walk = (p) => { for (const e of fs.readdirSync(p, { withFileTypes: true })) { const f2 = p + "/" + e.name; if (e.isDirectory()) walk(f2); else found.push([`${tag}>${e.name}`, fs.readFileSync(f2).toString("latin1")]); } };
      walk(`${t0}/o`);
      return;
    }
    if (isSalted) {
      fs.writeFileSync(`${t0}/x.enc`, b);
      const bundle = secrets_bundle;
      for (const era of ["gen1", "recovery-3"]) for (const field of ["keysZipUnlock", "keysBackupUnlock"]) {
        const pass = bundle?.[era]?.[field];
        if (typeof pass !== "string") continue;
        for (const iter of ["200000", "300000"]) {
          try {
            const out = execFileSync("openssl", ["enc", "-d", "-aes-256-cbc", "-pbkdf2", "-iter", iter, "-in", `${t0}/x.enc`, "-pass", `pass:${pass}`], { input: b, stdio: ["pipe", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 });
            await unwrap(out, `${tag}>ssl${iter}`, depth + 1, found);
            return;
          } catch { /* next */ }
        }
      }
      return;
    }
    if (isB64) {
      try { const dec = Buffer.from(b.toString("latin1").replace(/\s+/g, ""), "base64"); if (dec.length > 20) { await unwrap(dec, `${tag}>b64`, depth + 1, found); return; } } catch { /* */ }
    }
    found.push([tag, b.toString("latin1")]);
  } finally { try { fs.rmSync(t0, { recursive: true, force: true }); } catch { /* */ } }
}
const secrets_bundle = {};

const sha256hex = (b) => crypto.createHash("sha256").update(b).digest("hex");
function pubFromSeed(seed32) {
  const pub = secp.getPublicKey(Buffer.from(seed32), true);
  const chk = Buffer.from(ripemd160(Buffer.from(pub))).slice(0, 4);
  return "STM" + bs58.encode(Buffer.concat([Buffer.from(pub), chk]));
}
function wifDecode(w) {
  const d = bs58.decode(w.trim());
  let body, chk;
  if (d.length === 38) { body = d.slice(0, 34); chk = d.slice(34); if (body[0] !== 0x80 || body[33] !== 0x01) throw new Error("f38"); }
  else if (d.length === 37) { body = d.slice(0, 33); chk = d.slice(33); if (body[0] !== 0x80) throw new Error("f37"); }
  else throw new Error("len" + d.length);
  if (!sha256d(body).slice(0, 4).equals(chk)) throw new Error("chk");
  return body.slice(1, 33);
}
const pubOfWif = (w) => pubFromSeed(wifDecode(w));
const fp2 = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 8);
const log = (o) => console.log(JSON.stringify(o));

// ── graphene tx signing (chain-registry serialization, custom_json=18) ──────
class W { constructor() { this.b = []; } u8(v) { this.b.push(v & 0xff); return this; } u16(v) { this.b.push(v & 0xff, (v >> 8) & 0xff); return this; } u32(v) { this.b.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff); return this; } i32(v) { return this.u32(v >>> 0); } varint(v) { let n = BigInt(v); for (;;) { const x = Number(n & 0x7fn); n >>= 7n; this.u8(n === 0n ? x : x | 0x80); if (n === 0n) break; } return this; } str(s) { const u = Buffer.from(s, "utf8"); this.varint(u.length); this.b.push(...u); return this; } out() { return Buffer.from(this.b); } }
function serializeTx(tx) {
  const w = new W();
  w.u16(tx.ref_block_num).u32(tx.ref_block_prefix).i32(Math.floor(new Date(tx.expiration + "Z").getTime() / 1000));
  w.varint(tx.operations.length);
  for (const [name, v] of tx.operations) {
    if (name !== "custom_json") throw new Error("op-not-supported:" + name);
    w.varint(18);
    w.varint((v.required_auths ?? []).length); for (const a of v.required_auths ?? []) w.str(a);
    w.varint((v.required_posting_auths ?? []).length); for (const a of v.required_posting_auths ?? []) w.str(a);
    w.str(v.id).str(v.json ?? "{}");
  }
  w.varint(0);
  return w.out();
}
function signTx(tx, wif, chainIdHex) {
  const bin = serializeTx(tx);
  const digest = crypto.createHash("sha256").update(Buffer.concat([Buffer.from(chainIdHex, "hex"), bin])).digest();
  const sig = secp.sign(digest, Buffer.from(wifDecode(wif)));
  const rec = sig.recovery ?? 0;
  const r = Buffer.from(sig.r.toString(16).padStart(64, "0"), "hex");
  const s = Buffer.from(sig.s.toString(16).padStart(64, "0"), "hex");
  return Buffer.concat([Buffer.from([31 + rec]), r, s]).toString("hex");
}

async function rpc(method, params) {
  for (const host of ["https://api.hive.blog", "https://api.hive.dev"]) {
    try {
      const r = await fetch(host, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }), signal: AbortSignal.timeout(12000) });
      const d = await r.json();
      if (d.error) continue;
      return d.result;
    } catch { /* next */ }
  }
  throw new Error("hive nodes unreachable");
}

const ACCOUNT = "headcorner";
const [acct] = await rpc("condenser_api.get_accounts", [[ACCOUNT]]);
const live = {
  posting: acct?.posting?.key_auths?.[0]?.[0] ?? "",
  active: acct?.active?.key_auths?.[0]?.[0] ?? "",
  owner: acct?.owner?.key_auths?.[0]?.[0] ?? "",
  memo: acct?.memo_key ?? "",
};
log({ step: "live-authorities", posting: fp2(live.posting), active: fp2(live.active) });

const WIF_RE = /[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{50,52}/g;
const liveHits = [];
function judgeText(text, tag) {
  for (const tok of String(text).match(WIF_RE) ?? []) {
    try {
      const pub = pubOfWif(tok);
      for (const [role, lp] of Object.entries(live)) if (pub === lp) liveHits.push({ tag, pub, wif: tok, role });
    } catch { /* */ }
  }
}

// ── 1. every runner-held secret ──────────────────────────────────────────────
const secrets = {};
for (const k of ["STEEM_VAULT_PASSES", "ROT2_FLEET_KEYS", "MAIN_KEY", "ROT_ROSTER", "FLEET_ROSTER_MAP", "CI_ADOPT_WIF_POSTING", "CI_ADOPT_WIF_ACTIVE", "STEEM_ACTIVE_WIF", "ZIP_PAT", "GH_PAT"]) {
  const v = process.env[k] ?? "";
  if (v.length > 8) secrets[k] = v;
}
Object.assign(secrets_bundle, secrets);
log({ step: "secrets-loaded", names: Object.keys(secrets) });
const VAULT_BLOBS = {};
{
  const pat = secrets.GH_PAT ?? process.env.GH_PAT ?? "";
  if (pat.length > 20) {
    for (const fname of VAULT_FILE_LIST) {
      try {
        const r = await fetch(`https://api.github.com/repos/roshpinacare-sys/steem/contents/agent/vault/${fname}`, { headers: { Authorization: `Bearer ${pat}`, Accept: "application/vnd.github.raw" }, signal: AbortSignal.timeout(30000) });
        if (r.ok) { VAULT_BLOBS[fname] = Buffer.from(await r.arrayBuffer()); }
      } catch { /* */ }
    }
    log({ step: "vault-blobs-fetched", n: Object.keys(VAULT_BLOBS).length });
  } else log({ step: "no-pat-for-blobs" });
}
for (const [k, v] of Object.entries(secrets)) {
  judgeText(v, k);
  try { judgeText(JSON.stringify(JSON.parse(v)), k + ":flat"); } catch { /* */ }
}

// ── 2. GEN-1 vault (sha-pinned) via STEEM_VAULT_PASSES ──────────────────────
try {
  const bundle = JSON.parse(secrets.STEEM_VAULT_PASSES ?? "{}");
  log({ step: "bundle-eras", eras: Object.keys(bundle) });
  const pass = bundle?.gen1?.keysZipUnlock;
  if (typeof pass === "string" && pass.length >= 8) {
    const b64 = process.env.GEN1_ZIP_B64 ?? "";
    if (b64.length > 100) {
      const blob = Buffer.from(b64, "base64");
      const tmp = fs.mkdtempSync(os.tmpdir() + "/g1-");
      fs.writeFileSync(`${tmp}/k.enc`, blob, { mode: 0o600 });
      execFileSync("openssl", ["enc", "-d", "-aes-256-cbc", "-pbkdf2", "-iter", "300000", "-in", `${tmp}/k.enc`, "-out", `${tmp}/inner.zip`, "-pass", `pass:${pass}`], { stdio: ["ignore", "ignore", "pipe"] });
      const inner = fs.readFileSync(`${tmp}/inner.zip`);
      if (sha256hex(inner) === (process.env.GEN1_INNER_SHA ?? "")) {
        log({ step: "gen1-opened-sha-pinned" });
        fs.writeFileSync(`${tmp}/inner.zip`, inner, { mode: 0o600 });
        execFileSync("unzip", ["-o", "-q", `${tmp}/inner.zip`, "-d", `${tmp}/o`]);
        const files = [];
        const walk = (p) => { for (const e of fs.readdirSync(p, { withFileTypes: true })) { const f2 = p + "/" + e.name; if (e.isDirectory()) walk(f2); else files.push(f2); } };
        walk(`${tmp}/o`);
        log({ step: "gen1-files", n: files.length });
        for (const f of files) { try { const t = fs.readFileSync(f, "utf8"); allOpenedTexts.push(t); judgeText(t, "gen1:" + f.split("/").pop()); } catch { /* */ } }
      } else log({ step: "gen1-inner-sha-mismatch" });
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* */ }
    } else log({ step: "gen1-blob-absent" });
  } else log({ step: "gen1-pass-absent" });
} catch (e) { log({ step: "gen1-error", detail: String(e).slice(0, 60) }); }

// ── 2. ALL sealed eras × all vault blobs, via the Actions-held pass bundle ──
try {
  const bundle = JSON.parse(secrets.STEEM_VAULT_PASSES ?? "{}");
  log({ step: "bundle-eras", eras: Object.keys(bundle) });
  for (const era of ["gen1", "recovery-3", "gen2"]) {
    const bundleEra = bundle?.[era];
    if (!bundleEra) { log({ step: "era-absent", era }); continue; }
    for (const field of ["keysZipUnlock", "keysBackupUnlock"]) {
      const pass = bundleEra?.[field];
      if (typeof pass !== "string" || pass.length < 8) continue;
      for (const fname of VAULT_FILE_LIST) {
        const blob = VAULT_BLOBS[fname];
        if (!blob) continue;
        try {
          const t2 = fs.mkdtempSync(os.tmpdir() + "/op-");
          fs.writeFileSync(`${t2}/a.enc`, blob, { mode: 0o600 });
          let out = null;
          for (const iters of ["200000", "300000"]) {
            try { out = execFileSync("openssl", ["enc", "-d", "-aes-256-cbc", "-pbkdf2", "-iter", iters, "-in", `${t2}/a.enc`, "-out", `${t2}/out.bin`, "-pass", `pass:${pass}`], { stdio: ["ignore", "ignore", "pipe"] }) ?? fs.readFileSync(`${t2}/out.bin`); break; } catch { /* next iter */ }
          }
          if (!out) throw new Error("no-iter-opened");
          const found = [];
          await unwrap(out, `${era}:${fname}`, 0, found);
          log({ step: "era-open", era, field, file: fname, leaves: found.length });
          for (const [tag, text] of found) { allOpenedTexts.push(text); judgeText(text, tag); }
          try { fs.rmSync(t2, { recursive: true, force: true }); } catch { /* */ }
        } catch { /* wrong pass for this file */ }
      }
    }
  }
} catch (e) { log({ step: "era-loop-error", detail: String(e).slice(0, 60) }); }

// ── 2.5 ROT1 HMAC tree from any 64-hex seed in opened material ──────────────
const hexSeeds = new Set();
for (const t of allOpenedTexts) for (const h of String(t).match(/[0-9a-fA-F]{64}/g) ?? []) hexSeeds.add(h.toLowerCase());
const ACCTS = ["headcorner", "tov", "cashmachine", "haran", "israelnews", "lsa", "macrame", "siq", "wic", "wog", "woq"];
const wifFromPriv32 = (priv32, compressed) => { const tail = compressed ? Buffer.from([1]) : Buffer.alloc(0); const payload = Buffer.concat([Buffer.from([0x80]), priv32, tail]); return bs58.encode(Buffer.concat([payload, sha256d(payload).subarray(0, 4)])); };
for (const seed of hexSeeds) {
  const seedBuf = /^[0-9a-fA-F]{64}$/.test(seed) ? Buffer.from(seed, "hex") : Buffer.from(seed, "utf8");
  for (const account of ACCTS) for (const [net, chainToks] of Object.entries({ STEEM: ["STEEM", "steem"], HIVE: ["HIVE", "hive"] })) for (const chainTok of chainToks) for (const role of ["owner", "active", "posting", "memo"]) {
    const label = `SAOS-ROT1/${account}/${chainTok}/${role}`;
    const variants = [
      crypto.createHmac("sha256", seedBuf).update(Buffer.from(label, "utf8")).digest(),
      crypto.createHmac("sha256", Buffer.from(label, "utf8")).update(seedBuf).digest(),
    ];
    for (const priv32 of variants) for (const compressed of [true, false]) {
      try {
        const wif = wifFromPriv32(priv32, compressed);
        const pub = pubOfWif(wif);
        for (const [r, lp] of Object.entries(live)) if (pub === lp) liveHits.push({ tag: `rot1tree:${seed.slice(0, 6)}:${account}/${chainTok}/${role}${compressed ? "" : ":u"}`, pub, wif, role: r });
      } catch { /* */ }
    }
  }
}
log({ step: "tree-swept", seeds: hexSeeds.size });

log({ step: "judged", liveHits: liveHits.length });
for (const h of liveHits) log({ hit: h.role, tag: h.tag, pubFp: fp2(h.pub) });

const posting = liveHits.find((h) => h.role === "posting");
if (!posting) { log({ ok: false, error: "no live hive posting authority in runner-held material" }); process.exit(1); }
log({ step: "hive-custody-verified", via: posting.tag, pubFp: fp2(posting.pub) });

const dgpo = await rpc("condenser_api.get_dynamic_global_properties", []);
const head = Number(dgpo.head_block_number);
const prefix = Buffer.from(String(dgpo.head_block_id), "hex").readUInt32LE(4);
const payload = {
  protocol: "saos.weave.v1",
  kind: "hive-custody-live",
  note: "first HIVE treasury-signed op — vault custody verified against the live authority on the runner, transported by the public non-custodial relay",
  authorizedBy: "owner 2026-10-17",
  t: Math.floor(Date.now() / 1000),
};
const tx = {
  ref_block_num: head & 0xffff,
  ref_block_prefix: prefix,
  expiration: new Date((Math.floor(Date.now() / 1000) + 60) * 1000).toISOString().slice(0, 19),
  operations: [["custom_json", { required_auths: [], required_posting_auths: [ACCOUNT], id: "saos.weave.v1", json: JSON.stringify(payload) }]],
  extensions: [],
};
const sig = signTx(tx, posting.wif, "beeab0de00000000000000000000000000000000000000000000000000000000");
const signed = { ...tx, signatures: [sig] };
const b64 = Buffer.from(JSON.stringify(signed), "utf8").toString("base64");
fs.writeFileSync("signed-tx.b64", b64);
log({ step: "signed", ops: 1, sigs: 1, expiration: tx.expiration });
console.log("===SIGNED-TX-B64===");
console.log(b64);
console.log("===END===");
