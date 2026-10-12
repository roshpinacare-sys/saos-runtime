// ARMY-CACHE-RESOLVE — R-VAULTPASS-2 · owner=active ignition (exec-20)
// ══════════════════════════════════════════════════════════════════════════════════════════
// MEASURED ROOT CAUSE (exec-20, 02:12Z heartbeat): R-VAULTPASS-1 moved the vault
// unlock passes out of the steem repo into the STEEM_VAULT_PASSES secret, but the
// engine's own revival (vault-revival.mjs → unlockGeneration) never consumed the
// secret — it decrypts with meta.keysZipPass only, which no longer opens the
// re-sealed bundle → REVIVAL-FAIL 0/14 → post step ENOENT engine/.secrets/army-keys.json
// → the whole grid stood down (social executed 0, delegation refused).
//
// THIS SCRIPT COMPLETES THE LOOP the key-census-probe PROVED live (receipt
// 2026-10-12T01:56Z: the GEN-2 bundle opens via bundle.gen2.keysZipUnlock; 27 WIFs
// matched the LIVE on-chain authorities, derivedNoMatch=0). It decrypts the sealed
// bundle and writes the engine cache (.secrets/army-keys.json) in the EXACT schema
// the engine's own pullArmyKeysFromVault() writer produces. The engine then
// chain-judges EVERY WIF itself (adoptFromCache → adoptVerifiedWifIdentity) —
// this file is material, the CHAIN is the only judge; a stale/dead key still
// refuses honestly and the beat reports its own verdict.
//
// LAWS: never prints key material (verdict-only stdout); passes env-only; the
// cache is written 0600 atomically; plaintext temporaries live only in a 0700
// mkdtemp and are destroyed in finally; fail-closed on any sha mismatch; honest
// abort (exit 1) when the secret is absent — never a fake green.
//
// Usage: node ops/army-cache-resolve.cjs --out <engine>/.secrets/army-keys.json
'use strict';
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const P = require("./key-census-probe/probe.cjs");

(async () => {
  const outIdx = process.argv.indexOf("--out");
  const outPath = outIdx >= 0 ? process.argv[outIdx + 1] : null;
  if (!outPath) { console.error("army-cache-resolve: --out is required (fail-closed)"); process.exit(2); }

  const pat = process.env.GH_PAT || "";
  let bundle = {};
  try { bundle = JSON.parse(process.env.STEEM_VAULT_PASSES || "{}"); } catch { bundle = {}; }
  const gen2Pass = bundle?.gen2?.keysZipUnlock || "";
  if (!pat || gen2Pass.length < 8) {
    console.error("army-cache-resolve: GH_PAT or STEEM_VAULT_PASSES.gen2.keysZipUnlock absent — honest abort (fail-closed, the beat stays the honest reporter)");
    process.exit(1);
  }

  const work = fs.mkdtempSync(path.join(os.tmpdir(), "ignite-"));
  fs.chmodSync(work, 0o700);
  try {
    const livePubs = await P.liveAuthorities();
    const steemDir = path.join(work, "steem");
    execFileSync("git", ["clone", "--depth", "1", "--branch", "main",
      `https://x-access-token:${pat}@github.com/roshpinacare-sys/steem.git`, steemDir], { stdio: "pipe" });

    const meta = JSON.parse(fs.readFileSync(path.join(steemDir, "agent", "recovery-meta.json"), "utf8"));

    /* bundle of record: the meta-declared keysZipFile, else the newest sealed
     * KEYS-ZIP-*.zip.enc under agent/vault (GEN2-preferred, census-proven path). */
    let zipFile = typeof meta.keysZipFile === "string" ? meta.keysZipFile : null;
    if (!zipFile || !fs.existsSync(path.join(steemDir, zipFile))) {
      const vaultDir = path.join(steemDir, "agent", "vault");
      const zips = fs.readdirSync(vaultDir).filter((f) => /^KEYS-ZIP-.*\.zip\.enc$/.test(f)).sort();
      if (!zips.length) { console.error("army-cache-resolve: no sealed bundle in agent/vault — honest abort"); process.exit(1); }
      zipFile = `agent/vault/${zips[zips.length - 1]}`;
    }
    const encPath = path.join(steemDir, zipFile);
    const encBuf = fs.readFileSync(encPath);
    const outerSha = crypto.createHash("sha256").update(encBuf).digest("hex");
    const metaPinned = meta.keysZipFile === zipFile;
    if (metaPinned && meta.keysZipSha256 && outerSha !== meta.keysZipSha256) {
      console.error(`army-cache-resolve: outer sha mismatch on ${zipFile} — refusing (fail-closed)`);
      process.exit(1);
    }

    const decPath = path.join(work, "keys.zip");
    const passes = [
      { name: "bundle.gen2.keysZipUnlock", value: gen2Pass },
      { name: "bundle.recovery-3.keysZipUnlock", value: bundle?.["recovery-3"]?.keysZipUnlock || "" },
      { name: "meta.keysZipPass", value: typeof meta.keysZipPass === "string" ? meta.keysZipPass : "" },
    ].filter((p) => p.value && p.value.length >= 8);

    let hitName = null;
    for (const p of passes) {
      if (P.decryptTry(encPath, decPath, p.value, p.name)) { hitName = p.name; break; }
    }
    if (!hitName) { console.error("army-cache-resolve: decrypt failed on all known passes — honest abort (fail-closed)"); process.exit(1); }

    const innerBuf = fs.readFileSync(decPath);
    const innerSha = crypto.createHash("sha256").update(innerBuf).digest("hex");
    if (metaPinned && meta.keysZipInnerSha256 && innerSha !== meta.keysZipInnerSha256) {
      console.error(`army-cache-resolve: inner sha mismatch on ${zipFile} — refusing (fail-closed)`);
      process.exit(1);
    }

    const unzipDir = path.join(work, "unzipped");
    fs.mkdirSync(unzipDir, { recursive: true });
    execFileSync("unzip", ["-o", "-q", decPath, "-d", unzipDir], { stdio: "pipe" });

    const cands = [];
    P.scanDir(unzipDir, cands);
    /* classify every candidate against the LIVE chain authorities (public keys
     * only) — the same proven path as the census; nothing is trusted by shape. */
    const byAccount = new Map();
    let matched = 0;
    for (const c of cands) {
      const r = P.classify(c, livePubs);
      if (!r.ok) continue;
      matched++;
      const e = byAccount.get(r.account) || {};
      if (r.role === "posting") { e.wif = c.wif; e.pub = r.derivedPub || null; }
      if (r.role === "active") { e.activeWif = c.wif; e.activePub = r.derivedPub || null; }
      byAccount.set(r.account, e);
    }

    /* roster completeness: the engine's custody counts master+ARMY (14/14) — the
     * same set probe.cjs ROSTER carries. A missing roster account means an
     * incomplete revival (the engine would re-pull and fall back) — refuse
     * honestly instead of writing a partial cache. */
    const roster = P.ROSTER;
    const missing = roster.filter((name) => !(byAccount.get(name) || {}).wif);
    if (missing.length) {
      console.error(`army-cache-resolve: roster incomplete — missing posting for: ${missing.join(", ")} — honest abort (fail-closed)`);
      process.exit(1);
    }

    /* exact mirror of pullArmyKeysFromVault()'s cache schema: accounts sorted,
     * one GEN-2 generation entry per account, gens carry wif/pub/activeWif/activePub. */
    const accounts = roster.slice().sort().map((name) => {
      const e = byAccount.get(name);
      return { name, gens: [{ gen: "GEN-2", wif: e.wif, pub: e.pub ?? null, activeWif: e.activeWif ?? null, activePub: e.activePub ?? null }] };
    });
    const cache = {
      extractedAt: new Date().toISOString(),
      generations: [{ gen: "GEN-2", outerSha: outerSha.slice(0, 8), innerSha: innerSha.slice(0, 8) }],
      errors: [],
      accounts,
    };

    /* atomic 0600 write (engine law R235): tmp + rename, dir 0700. */
    fs.mkdirSync(path.dirname(outPath), { recursive: true, mode: 0o700 });
    const tmp = `${outPath}.tmp.${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify(cache, null, 2), { mode: 0o600 });
    fs.chmodSync(tmp, 0o600);
    fs.renameSync(tmp, outPath);

    /* verdict-only receipt: account names and presence flags — NEVER material. */
    console.log(`army-cache-resolve: IGNITED bundle=${zipFile} pass=${hitName} outer=${outerSha.slice(0, 8)} inner=${innerSha.slice(0, 8)}`);
    console.log(`army-cache-resolve: roster ${roster.length - missing.length}/${roster.length} · candidates=${cands.length} · chainMatched=${matched}`);
    for (const a of accounts) {
      console.log(`army-cache-resolve: READY ${a.name} · posting=${a.gens[0].wif ? "yes" : "no"} · active=${a.gens[0].activeWif ? "yes" : "no"}`);
    }
    console.log("army-cache-resolve: cache written 0600 — the CHAIN judges every WIF in the beat (this file is material, not truth)");
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
})().catch((e) => { console.error("army-cache-resolve: FATAL:", String(e?.message ?? e).slice(0, 160)); process.exit(1); });
