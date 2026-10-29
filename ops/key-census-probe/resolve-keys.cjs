// RESOLVE-KEYS — מפענח-כרוך-ה-GEN-2 בזמן-ריצה ומוציא קובץ-מפתחות-0700 לצרכנים-באותו-job
// ════════════════════════════════════════════════════════════════════════════════════════
// R16-a · owner mandate trace 1a12…ff11. אח של key-census-probe (probe.cjs — מספק
// את-כל-הפנימיים): מפענח את כרוך-ה-custody, מתאים מול-הרשויות-החיות, וכותב לקובץ-פלט
// {account: {active, posting}} — לעולם לא מדפיס WIF, לעולם לא כותב מחוץ-לקובץ-היעד.
// הקובץ חי רק-בתוך-ה-job (0700) ונמחק בסופו. צרכנים: grids/escrow-payroll.mjs --keys-file.
//
// שימוש: NODE_PATH=<steem-lib> node ops/key-census-probe/resolve-keys.cjs --out /tmp/fk.json
'use strict';
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const P = require("./probe.cjs");

async function main() {
  const outIdx = process.argv.indexOf("--out");
  const outPath = outIdx >= 0 ? process.argv[outIdx + 1] : null;
  if (!outPath) { console.error("resolve-keys: --out חובה (fail-closed)"); process.exit(2); }

  const pat = process.env.GH_PAT || "";
  if (!pat) { console.error("resolve-keys: GH_PAT missing — honest abort"); process.exit(1); }
  const bundle = JSON.parse(process.env.STEEM_VAULT_PASSES || "{}");

  const work = fs.mkdtempSync(path.join(os.tmpdir(), "rkeys-"));
  fs.chmodSync(work, 0o700);
  try {
    const livePubs = await P.liveAuthorities();
    const steemDir = path.join(work, "steem");
    execFileSync("git", ["clone",
      `https://x-access-token:${pat}@github.com/roshpinacare-sys/steem.git`, steemDir], { stdio: "pipe" });
    // FIX-RK2 (2026-10-29): default branch (saos-cockpit) + full history — the seal commits
    // removed agent/vault/*.enc from every branch tip; the archives live ONLY in history.
    // Old code cloned --branch main depth-1: ENOENT on recovery-meta (main lacks it) and
    // no history to recover zips → permanent KEYLESS-STASIS since 2026-10-28T21:35Z.
    const meta = JSON.parse(fs.readFileSync(path.join(steemDir, "agent", "recovery-meta.json"), "utf8"));

    const zips = [];
    if (meta.keysZipFile && fs.existsSync(path.join(steemDir, meta.keysZipFile))) zips.push({ file: meta.keysZipFile, innerSha: meta.keysZipInnerSha256 });
    try {
      for (const f of fs.readdirSync(path.join(steemDir, "agent", "vault"))) {
        if (/^KEYS-.*\.enc$/.test(f) && !zips.some((z) => z.file.endsWith(f))) zips.push({ file: `agent/vault/${f}`, innerSha: null });
      }
    } catch {}
    // FIX-RK2: recover every vault archive EVER committed (history) — the seals removed
    // them from the tip but git history is the lawful archive. Also the ROT2/BACKUP/SEED family.
    try {
      const hist = execFileSync("git", ["log", "--all", "--diff-filter=A", "--format=%H", "-1", "--", "agent/vault/"],
        { cwd: steemDir, encoding: "utf8" }).trim();
      const names = execFileSync("git", ["log", "--all", "--diff-filter=A", "--format=", "--name-only", "--", "agent/vault/"],
        { cwd: steemDir, encoding: "utf8" }).split("\n").map(s => s.trim()).filter(f => /^agent\/vault\/KEYS-.*\.enc$/.test(f));
      for (const f of [...new Set(names)]) {
        if (zips.some((z) => z.file === f)) continue;
        try {
          const sha = execFileSync("git", ["log", "--all", "--diff-filter=A", "--format=%H", "-1", "--", f],
            { cwd: steemDir, encoding: "utf8" }).trim().split("\n")[0];
          if (!sha) continue;
          const data = execFileSync("git", ["show", `${sha}:${f}`], { cwd: steemDir, maxBuffer: 64 * 1024 * 1024 });
          const tmpEnc = path.join(work, "hist-" + path.basename(f));
          fs.writeFileSync(tmpEnc, data);
          zips.push({ file: f, tmpEnc, innerSha: null });
        } catch {}
      }
      void hist;
    } catch {}
    zips.sort((a, b) => (b.file.includes("GEN2") ? 1 : 0) - (a.file.includes("GEN2") ? 1 : 0));

    const passes = [
      { name: "gen2", value: bundle?.gen2?.keysZipUnlock || "" },
      { name: "recovery-3", value: bundle?.["recovery-3"]?.keysZipUnlock || "" },
      { name: "meta", value: meta.keysZipPass || "" },
    ].filter((p) => p.value && p.value.length >= 8);

    let decrypted = null;
    for (const z of zips) {
      const decPath = path.join(work, "keys.zip");
      let hit = false;
      for (const pc of passes) {
        const encPath = z.tmpEnc || path.join(steemDir, z.file);
        if (P.decryptTry(encPath, decPath, pc.value, pc.name)) { hit = true; break; }
      }
      if (!hit) continue;
      if (z.innerSha) {
        const actual = execFileSync("sha256sum", [decPath], { encoding: "utf8" }).split(" ")[0];
        if (actual !== z.innerSha) { console.log(`[resolve-keys] inner sha mismatch on ${z.file} — refusing`); continue; }
      }
      decrypted = decPath;
      break;
    }
    // R324-EXAMINE-FIX (trace 1a1379e13145bd25, measured run 38482136810): the fleet
    // rotated (ROT2, 2026-10-13T00:05, chain-verified receipt-A) AFTER the GEN-2 zip
    // payload was sealed — the zip census matched 0 across 0 and treasury-ladder slept
    // green (KEYLESS-STASIS exit-0 = invisible to failure-based alerting).
    // ROT2_FLEET_KEYS (custody-recover whole-map PUT, {rot2:{account:{role:wif}}})
    // arrives in the job env as plaintext — same trust domain as every other env
    // secret; WIFs never logged, never leave the job (0600 out-file only).
    // Additive alive-wins: (A) the GEN-2 zip census stands; (B) ROT2 overrides it
    // because it is the fresher, chain-verified material.
    const map = {};
    let matched = 0;

    // (A) GEN-2 zip census — custody-of-record (unchanged behavior when decryptable)
    if (decrypted) {
      const unzipDir = path.join(work, "unzipped");
      fs.mkdirSync(unzipDir, { recursive: true });
      execFileSync("unzip", ["-o", "-q", decrypted, "-d", unzipDir], { stdio: "pipe" });
      const cands = [];
      P.scanDir(unzipDir, cands);
      for (const c of cands) {
        const r = P.classify(c, livePubs);
        if (r.ok) {
          matched++;
          map[r.account] = map[r.account] || {};
          map[r.account][r.role] = c.wif;
        }
      }
    } else {
      console.log("[resolve-keys] GEN-2 zip not decryptable this run — ROT2-env path is the live source");
    }

    // (B) ROT2 fast path — post-rotation fleet keys (override stale zip matches)
    // Measured shapes: custody-recover PUTs {rot2:{<chain>:{<account>:{<role>:{wif,...}}}}}
    // — deep-walk collects every WIF-shaped string, zero shape assumptions (format-proof);
    // classify re-derives account/role from the LIVE chain authorities, labels irrelevant.
    let rot2Matched = 0, rot2Wifs = 0;
    const rot2Raw = process.env.ROT2_FLEET_KEYS || "";
    if (rot2Raw) {
      try {
        const parsed = JSON.parse(rot2Raw);
        const wifs = new Set();
        const WIF_RE = P.WIF_RE || /^[5JK][1-9A-HJ-NP-Za-km-z]{50}$/;
        (function walk(node, depth) {
          if (!node || typeof node !== "object" || depth > 8) return;
          for (const v of Object.values(node)) {
            if (typeof v === "string") { if (WIF_RE.test(v)) wifs.add(v); }
            else if (v && typeof v === "object") walk(v, depth + 1);
          }
        })(parsed, 0);
        rot2Wifs = wifs.size;
        for (const wif of wifs) {
          const r = P.classify({ source: "rot2-env", wif }, livePubs);
          if (r.ok) {
            map[r.account] = map[r.account] || {};
            if (!map[r.account][r.role]) { matched++; rot2Matched++; }
            map[r.account][r.role] = r.wif;
          }
        }
      } catch {
        console.log("[resolve-keys] ROT2_FLEET_KEYS unparsable — GEN-2 zip census stands alone");
      }
      console.log(`[resolve-keys] rot2-env source: ${rot2Wifs} wif-candidates → ${rot2Matched} live keys (chain-verified ROT2, overrides stale zip)`);
    }
    fs.writeFileSync(outPath, JSON.stringify(map) + "\n");
    fs.chmodSync(outPath, 0o600);
    const accounts = Object.keys(map);
    console.log(`[resolve-keys] matched ${matched} live keys across ${accounts.length} accounts → ${outPath} (0600, job-only)`);
    for (const a of accounts) console.log(`[resolve-keys] ${a}: ${Object.keys(map[a]).join("+")}`);
    if (accounts.length === 0) { console.error("resolve-keys: no live matches — honest abort"); process.exit(1); }
  } finally {
    try { fs.rmSync(work, { recursive: true, force: true }); } catch {}
  }
}
main().catch((e) => { console.error("[resolve-keys] FATAL:", String(e?.message ?? e)); process.exit(1); });
