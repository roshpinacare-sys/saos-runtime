#!/usr/bin/env node
// envelope-open-probe v3 — מינימלי-וממוקד: VAULT_RESTORE_PASS-בלבד · אימות-הלוך-ושוב-פנימי
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const fp = (s) => createHash("sha256").update(String(s)).digest("hex").slice(0, 8);
async function main() {
  const pat = process.env.GH_PAT || "";
  const pass = process.env.VAULT_RESTORE_PASS || "";
  console.log("pass-קיים:", pass.length > 0, "· len:", pass.length, "· fp:", pass ? fp(pass) : "—");
  if (!pat || !pass) process.exit(0);
  const work = mkdtempSync(join(tmpdir(), "ep3-"));
  try {
    // אימות-הלוך-ושוב-פנימי: אטום+פתח-טקסט-מבחן
    writeFileSync(join(work, "t.txt"), "roundtrip-test-payload");
    execFileSync("openssl", ["enc", "-aes-256-cbc", "-pbkdf2", "-iter", "300000", "-pass", "pass:" + pass, "-in", join(work, "t.txt"), "-out", join(work, "t.enc")], { stdio: "pipe" });
    execFileSync("openssl", ["enc", "-d", "-aes-256-cbc", "-pbkdf2", "-iter", "300000", "-pass", "pass:" + pass, "-in", join(work, "t.enc"), "-out", join(work, "t2.txt")], { stdio: "pipe" });
    const ok = readFileSync(join(work, "t2.txt"), "utf8") === "roundtrip-test-payload";
    console.log("אימות-פנימי-הלוך-ושוב:", ok ? "PASS" : "FAIL");
    // המעטפות
    execFileSync("git", ["clone", "-q", "--depth", "1", "https://x-access-token:" + pat + "@github.com/roshpinacare-sys/vault-home.git", join(work, "vh")], { stdio: "pipe" });
    const files = ["ARMY-ACTIVE-REVIVE-20261116T061649Z.enc", "ARMY-ACTIVE-REVIVE-20261116T062818Z.enc", "ARMY-ACTIVE-REVIVE-20261116T065935Z.enc"];
    for (const f of files) {
      writeFileSync(join(work, "e.enc"), readFileSync(join(work, "vh", "custody-intake", f)));
      try {
        execFileSync("openssl", ["enc", "-d", "-aes-256-cbc", "-pbkdf2", "-iter", "300000", "-pass", "pass:" + pass, "-in", join(work, "e.enc"), "-out", join(work, "p.txt")], { stdio: "pipe" });
        const t = readFileSync(join(work, "p.txt"), "utf8");
        const readable = /^[\\x20-\\x7E\\n\\r\\t]+$/.test(t);
        const wifs = readable ? (t.match(/[5KL][1-9A-HJ-NP-Za-km-z]{50,51}/g) || []).length : -1;
        console.log(f + ": " + (readable ? "נפתחה ✔ · WIFs=" + wifs + " · len=" + t.length : "נפתחה-אך-לא-קריאה (פתיחה-כוזבת?) len=" + t.length));
      } catch { console.log(f + ": ✘ נכשלה"); }
    }
  } finally { rmSync(work, { recursive: true, force: true }); }
}
main().catch(e => { console.error("THROW " + String(e).slice(0, 100)); process.exit(1); });
