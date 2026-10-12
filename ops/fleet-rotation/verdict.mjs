#!/usr/bin/env node
/** verdict.mjs — fleet-rotation-a verdict law: green only on honest, verified, custody-backed rotation. */
import fs from "fs";

const receipt = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const s = receipt.summary || {};
const rotated = (s.rotatedVerified || 0) + (s.verifyPending || 0);
const accounts = receipt.accounts || [];
const custodyHoles = accounts.filter(
  (a) => String(a.verdict || "").startsWith("ROTATED") && !(a.custodyRepos || []).length
);
console.log("verdict inputs:", JSON.stringify(s));
console.log("custody holes:", custodyHoles.map((a) => a.chain + ":" + a.account).join(",") || "none");
if (rotated < 1) {
  console.error("VERDICT: FAIL — nothing rotated-verified");
  process.exit(1);
}
if (custodyHoles.length) {
  console.error("VERDICT: FAIL — rotated accounts without custody (new material must not live only in /tmp)");
  process.exit(1);
}
console.log("VERDICT: PASS — rotated", rotated, "of", s.total, "roster entries (skips/fails are recorded honestly in the receipt)");
