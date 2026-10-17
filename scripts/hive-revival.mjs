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
log({ step: "secrets-loaded", names: Object.keys(secrets) });
for (const [k, v] of Object.entries(secrets)) {
  judgeText(v, k);
  try { judgeText(JSON.stringify(JSON.parse(v)), k + ":flat"); } catch { /* */ }
}

// ── 2. GEN-1 vault (sha-pinned) via STEEM_VAULT_PASSES ──────────────────────
try {
  const bundle = JSON.parse(secrets.STEEM_VAULT_PASSES ?? "{}");
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
        for (const f of files) { try { judgeText(fs.readFileSync(f, "utf8"), "gen1:" + f.split("/").pop()); } catch { /* */ } }
      } else log({ step: "gen1-inner-sha-mismatch" });
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* */ }
    } else log({ step: "gen1-blob-absent" });
  } else log({ step: "gen1-pass-absent" });
} catch (e) { log({ step: "gen1-error", detail: String(e).slice(0, 60) }); }

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
