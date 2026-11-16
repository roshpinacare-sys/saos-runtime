#!/usr/bin/env node
// envelope-open-probe v4 — סופי: אימות-לפי-סכימה (לא-regex-קריאות) + מטא-מלא
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const fp = (s) => createHash("sha256").update(String(s)).digest("hex").slice(0, 8);
async function main() {
  const pat = process.env.GH_PAT || "";
  const pass = process.env.VAULT_RESTORE_PASS || "";
  console.log("pass-קיים:", pass.length > 0);
  if (!pat || !pass) process.exit(0);
  const work = mkdtempSync(join(tmpdir(), "ep4-"));
  const opened = [];
  try {
    execFileSync("git", ["clone", "-q", "--depth", "1", "https://x-access-token:" + pat + "@github.com/roshpinacare-sys/vault-home.git", join(work, "vh")], { stdio: "pipe" });
    const dir = join(work, "vh", "custody-intake");
    const files = readdirSync(dir).filter(f => f.startsWith("ARMY-ACTIVE-REVIVE-") && f.endsWith(".enc")).sort();
    console.log("מעטפות:", files.length);
    for (const f of files) {
      writeFileSync(join(work, "e.enc"), readFileSync(join(dir, f)));
      try {
        execFileSync("openssl", ["enc", "-d", "-aes-256-cbc", "-pbkdf2", "-iter", "300000", "-pass", "pass:" + pass, "-in", join(work, "e.enc"), "-out", join(work, "p.txt")], { stdio: "pipe" });
        const t = readFileSync(join(work, "p.txt"), "utf8");
        if (t.includes("SAOS-ARMY-ACTIVE-REVIVE")) {
          const j = JSON.parse(t);
          const mat = j.material || {};
          const accts = Object.keys(mat);
          const wifs = (t.match(/[5KL][1-9A-HJ-NP-Za-km-z]{50,51}/g) || []).length;
          console.log("OK " + f + " · schema=" + j.schema + " · חשבונות=" + JSON.stringify(accts).slice(0, 150) + " · WIFs=" + wifs);
          opened.push({ file: f, accounts: accts, wifFps: (t.match(/[5KL][1-9A-HJ-NP-Za-km-z]{50,51}/g) || []).map(w => fp(w)) });
        } else console.log(f + ": פתיחה-אך-סכימה-שגויה len=" + t.length);
      } catch { console.log(f + ": ✘"); }
    }
    console.log("נפתחו:", opened.length + "/" + files.length);
    try { mkdirSync("receipts", { recursive: true }); writeFileSync("receipts/envelope-open-final.json", JSON.stringify({ at: new Date().toISOString(), seal: "VAULT_RESTORE_PASS·iter300000", opened }, null, 1)); } catch {}
  } finally { rmSync(work, { recursive: true, force: true }); }
}
main().catch(e => { console.error("THROW " + String(e).slice(0, 100)); process.exit(1); });
