#!/usr/bin/env node
// envelope-open-probe.mjs — §㊾ · פתיחת-מעטפות-ARMY-ACTIVE-REVIVE עם-סיסמאות-המחסן-של-saos-runtime
// (VAULT_RESTORE_PASS + STEEM_VAULT_PASSES + ROT_ROSTER) — אפס-WIF-בלוג · טביעות-בלבד
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const fp = (s) => createHash("sha256").update(String(s)).digest("hex").slice(0, 8);
function collectStrings(node, out = new Set(), depth = 0) { if (!node || typeof node !== "object" || depth > 6) return out; if (Array.isArray(node)) { for (const v of node) collectStrings(v, out, depth + 1); return out; } for (const [k, v] of Object.entries(node)) { if (typeof v === "string" && v.length >= 16) out.add(v); else if (typeof v === "object") collectStrings(v, out, depth + 1); } return out; }
async function main() {
  const pat = process.env.GH_PAT || "";
  const pools = [];
  for (const envName of ["VAULT_RESTORE_PASS", "STEEM_VAULT_PASSES", "ROT_ROSTER"]) {
    const v = process.env[envName] || "";
    if (!v) continue;
    pools.push({ name: envName + ":direct", val: v });
    try { for (const s of collectStrings(JSON.parse(v))) pools.push({ name: envName + ":walk", val: s }); } catch {}
    for (const line of v.split(/[\n;]/)) { const t = line.trim(); if (t.length >= 16 && !pools.some(p => p.val === t)) pools.push({ name: envName + ":line", val: t }); }
  }
  console.log("[probe] סיסמאות-מועמדות: " + pools.length);
  if (!pat || pools.length === 0) { console.log("[probe] חסר-חומר — כנה"); process.exit(0); }
  const work = mkdtempSync(join(tmpdir(), "eprobe-"));
  try {
    execFileSync("git", ["clone", "--quiet", "--depth", "1", "https://x-access-token:" + pat + "@github.com/roshpinacare-sys/vault-home.git", join(work, "vh")], { stdio: "pipe" });
    const dir = join(work, "vh", "custody-intake");
    const files = readdirSync(dir).filter(f => f.startsWith("ARMY-ACTIVE-REVIVE-") && f.endsWith(".enc")).sort();
    console.log("[probe] מעטפות: " + files.length);
    const opened = [];
    for (const f of files) {
      writeFileSync(join(work, "e.enc"), readFileSync(join(dir, f)));
      let hit = "";
      for (const p of pools) {
        for (const iter of [200000, 300000, 100000]) {
          try { execFileSync("openssl", ["enc", "-d", "-aes-256-cbc", "-pbkdf2", "-iter", String(iter), "-in", join(work, "e.enc"), "-out", join(work, "p.txt"), "-pass", "pass:" + p.val], { stdio: "pipe" }); const t = readFileSync(join(work, "p.txt"), "utf8"); if (/^[\\x20-\\x7E\\n\\r\\t]+$/.test(t)) { hit = p.name + "(iter-" + iter + ")"; break; } } catch {}
        }
        if (hit) break;
      }
      if (hit) { const t = readFileSync(join(work, "p.txt"), "utf8"); const wifs = t.match(/[5KL][1-9A-HJ-NP-Za-km-z]{50,51}/g) || []; let parsed = null; try { parsed = JSON.parse(t); } catch {} const accounts = parsed ? (parsed.account ? [parsed.account] : Array.isArray(parsed) ? parsed.map(x => x?.account).filter(Boolean) : Object.keys(parsed)) : []; console.log("✔ " + f + " ← " + hit + " · WIFs=" + wifs.length + " · חשבונות=" + JSON.stringify([...new Set(accounts)]).slice(0, 120)); opened.push({ file: f, via: hit, accounts: [...new Set(accounts)], wifFps: wifs.map(w => fp(w)) }); }
      else console.log("✘ " + f);
    }
    console.log("[probe] נפתחו " + opened.length + "/" + files.length);
    try { mkdirSync("receipts", { recursive: true }); writeFileSync("receipts/envelope-open-probe-latest.json", JSON.stringify({ at: new Date().toISOString(), opened }, null, 1)); } catch (e) { console.log("קבלה-נכשלה: " + String(e).slice(0, 60)); }
  } finally { rmSync(work, { recursive: true, force: true }); }
}
main().catch(e => { console.error("THROW " + String(e).slice(0, 120)); process.exit(1); });
