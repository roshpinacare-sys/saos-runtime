#!/usr/bin/env node
// SYSTEM-MAP — הרשת רואה את עצמה (R324 · פקודת-המפעיל: «הרשת לא מודעת לעצמה»).
// ══════════════════════════════════════════════════════════════════════════════════════
// כל זרימה במאגר זה נבדקת מול GitHub-API: הרצה-אחרונה, סיום, אירוע, קצב-מתוכנן (cron)
// → פסק כנה לכל איבר: ALIVE / RED / STALE / GATED / NEVER-RUN. בנוסף נמדד דופק-הצאצא:
// ה-commit-האחרון על steem@saos-cockpit (state push-back) — גילו בדקות הוא הראיה שהמשרד
// עומד. המפה נכתבת בגיט (state/system-map/) — העדות היא קומיט, לא מילים.
// אפס-סודות: מטא-דאטה של Actions בלבד. אדום נשאר אדום — כנות לפני-הכל (חוק-הפסקים).
// fail-soft: כשל-מפה לעולם לא מפיל זרימה-אחרת; יוצא 0 תמיד אחרי-כתיבת-העדות שהצליחה.
'use strict';
const https = require("https");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const REPO = process.env.GITHUB_REPOSITORY || "roshpinacare-sys/saos-runtime";
const SIBLING = "roshpinacare-sys/steem";
const SIBLING_BRANCH = "saos-cockpit";
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "";
const APIHOST = "api.github.com";

function api(p) {
  return new Promise((resolve) => {
    const req = https.request(
      { host: APIHOST, path: p.startsWith("/") ? p : "/" + p, method: "GET",
        headers: { "User-Agent": "saos-system-map", Accept: "application/vnd.github+json",
          ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) }, timeout: 20000 },
      (res) => { let d = ""; res.on("data", (c) => (d += c));
        res.on("end", () => { try { resolve({ status: res.statusCode, json: JSON.parse(d || "null") }); }
          catch { resolve({ status: res.statusCode, json: null }); } }); });
    req.on("error", () => resolve({ status: 0, json: null }));
    req.on("timeout", () => { req.destroy(); resolve({ status: 0, json: null }); });
    req.end();
  });
}

function fetchRaw(repo, ref, file) {
  return new Promise((resolve) => {
    const req = https.request(
      { host: "raw.githubusercontent.com", path: `/${repo}/${ref}/${file}`, method: "GET",
        headers: { "User-Agent": "saos-system-map", ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) },
        timeout: 20000 },
      (res) => { let d = ""; res.on("data", (c) => (d += c)); res.on("end", () => resolve(res.statusCode === 200 ? d : "")); });
    req.on("error", () => resolve(""));
    req.on("timeout", () => { req.destroy(); resolve(""); });
    req.end();
  });
}

// מ-«13,43 * * * *» / «23 */4 * * *» / «41 5,17 * * *» — הערכת-מרווח בדקות
function cronGapMinutes(crons) {
  let best = Infinity;
  for (const c of crons || []) {
    const f = c.trim().split(/\s+/);
    if (f.length < 5) continue;
    const [minF, hourF, domF, monF, dowF] = f;
    if (domF !== "*" || monF !== "*" || dowF !== "*") { best = Math.min(best, 60 * 24 * 7); continue; }
    let gap;
    if (hourF === "*") {
      const mins = minF.split(",").flatMap((x) => (x.startsWith("*/") ? [] : [parseInt(x, 10)])).filter((n) => !isNaN(n));
      const step = (minF.match(/\*\/(\d+)/) || [])[1];
      gap = step
        ? parseInt(step, 10)
        : mins.length >= 2
          ? Math.min(...mins.slice(1).map((m, i) => m - mins[i])) * (mins.some((m) => m < mins[0]) ? 2 : 1)
          : 60;
    } else {
      const hours = hourF.split(",").flatMap((x) => (x.startsWith("*/") ? [24 / parseInt(x.slice(2), 10)] : [1])).filter((n) => n > 0);
      gap = 60 * (24 / Math.max(1, hours.length));
    }
    if (gap > 0) best = Math.min(best, gap);
  }
  return Number.isFinite(best) ? Math.max(5, best) : 60 * 24;
}

function verdictFor(flow) {
  const r = flow.lastRun;
  if (!r) return "NEVER-RUN";
  if (r.status === "in_progress" || r.status === "queued") return "ALIVE";
  if (r.conclusion === "failure") return "RED";
  if (r.conclusion === "cancelled") return "CANCELLED";
  if (r.conclusion === "skipped") return "GATED";
  if (r.conclusion !== "success") return "REVIEW";
  const ageMin = (Date.now() - new Date(r.created_at).getTime()) / 60000;
  const window = Math.max(60, (flow.gapMinutes || 60) * 3);
  // R324 precision: dispatch-only flows are EVENT-DRIVEN, not dead — older than
  // the freshness window they are IDLE (waiting for their trigger), not STALE.
  // STALE is reserved for SCHEDULED flows that missed their own clock.
  if (ageMin > window) return flow.crons.length ? "STALE" : "IDLE";
  return "ALIVE";
}

async function main() {
  const builtAt = new Date().toISOString();
  const map = { protocol: "SAOS-SYSTEM-MAP/1", builtAt, repo: REPO, flows: [], heartbeat: null, summary: {} };

  // 1) כל הזרימות + ההרצה-האחרונה של כל אחת
  const wf = await api(`/repos/${REPO}/actions/workflows?per_page=100`);
  const workflows = (wf.json && wf.json.workflows) || [];
  for (const w of workflows) {
    if (w.state !== "active") continue;
    const flow = { name: w.name, path: w.path, crons: [], gapMinutes: null, lastRun: null };
    const runs = await api(`/repos/${REPO}/actions/workflows/${w.id}/runs?per_page=3`);
    const rl = (runs.json && runs.json.workflow_runs) || [];
    if (rl.length) {
      const live = rl.find((r) => r.status === "in_progress" || r.status === "queued");
      const done = rl.find((r) => r.status === "completed");
      flow.lastRun = live
        ? { status: live.status, conclusion: null, event: live.event, created_at: live.created_at }
        : done && { status: "completed", conclusion: done.conclusion, event: done.event, created_at: done.created_at };
    }
    const raw = await fetchRaw(REPO, "HEAD", w.path);
    const crons = [...raw.matchAll(/cron:\s*"([^"]+)"/g)].map((m) => m[1]);
    flow.crons = crons;
    flow.gapMinutes = crons.length ? cronGapMinutes(crons) : null;
    flow.verdict = verdictFor(flow);
    map.flows.push(flow);
  }

  // 2) דופק-הצאצא: הקומיט-האחרון על steem@saos-cockpit (state push-back)
  const hb = await api(`/repos/${SIBLING}/commits?sha=${SIBLING_BRANCH}&per_page=1`);
  if (hb.json && hb.json[0]) {
    const at = hb.json[0].commit.committer.date;
    const ageMin = Math.round((Date.now() - new Date(at).getTime()) / 60000);
    map.heartbeat = { repo: SIBLING, branch: SIBLING_BRANCH, at, ageMinutes: ageMin,
      subject: (hb.json[0].commit.message || "").split("\n")[0].slice(0, 90),
      verdict: ageMin <= 100 ? "ALIVE" : "STALE" };
  } else {
    map.heartbeat = { repo: SIBLING, branch: SIBLING_BRANCH, verdict: "UNREACHABLE" };
  }

  const cnt = (v) => map.flows.filter((f) => f.verdict === v).length;
  map.summary = { alive: cnt("ALIVE"), red: cnt("RED"), stale: cnt("STALE"), gated: cnt("GATED"),
    cancelled: cnt("CANCELLED"), neverRun: cnt("NEVER-RUN"), review: cnt("REVIEW"), idle: cnt("IDLE"),
    heartbeat: map.heartbeat.verdict };

  // 3) SYSTEM-MAP.md — מפת-המשרד החיה, שפת-המפעיל
  const flowsSorted = [...map.flows].sort((a, b) => {
    const rank = { RED: 0, CANCELLED: 1, STALE: 2, "NEVER-RUN": 3, REVIEW: 4, GATED: 5, ALIVE: 6 };
    return (rank[a.verdict] ?? 9) - (rank[b.verdict] ?? 9);
  });
  const cadenceOf = (f) => (f.gapMinutes
    ? f.gapMinutes >= 1440 ? `כל ${Math.round(f.gapMinutes / 1440)} יום`
      : f.gapMinutes >= 60 ? `כל ${Math.round(f.gapMinutes / 60)} שע`
      : `כל ${f.gapMinutes} דק`
    : "dispatch-בלבד");
  const lastOf = (f) => (f.lastRun ? `${f.lastRun.created_at} · ${f.lastRun.event} · ${f.lastRun.conclusion || f.lastRun.status}` : "—");
  const badge = { ALIVE: "🟢", RED: "🔴", STALE: "🟡", GATED: "⚪", CANCELLED: "🟠", "NEVER-RUN": "⚫", REVIEW: "🟠", IDLE: "🔵" };
  const reds = flowsSorted.filter((f) => f.verdict === "RED" || f.verdict === "CANCELLED" || f.verdict === "STALE");
  const md = `# מפת-המשרד החיה — הרשת רואה את עצמה

נבנתה אוטונומית: **${builtAt}** · מאגר: \`${REPO}\` · העדה = קומיט זה.

## פסק-על
- **דופק-הצאצא** (state push-back ל-${SIBLING}@${SIBLING_BRANCH}): ${map.heartbeat.ageMinutes != null ? `**לפני ${map.heartbeat.ageMinutes} דק** — ${map.heartbeat.verdict}` : map.heartbeat.verdict}
  - «${map.heartbeat.subject || "—"}»
- **איברים**: 🟢 חיים ${map.summary.alive} · 🔴 אדומים ${map.summary.red} · 🟡 נעדרי-דופק ${map.summary.stale} · 🟠 בוטלים ${map.summary.cancelled} · 🔵 צופים-לטריגר ${map.summary.idle} · ⚪ שער ${map.summary.gated} · ⚫ לא-רצו-מעולם ${map.summary.neverRun}
- **פסק המשרד**: ${reds.length === 0 && map.heartbeat.verdict === "ALIVE" ? "🟢 עומד ומתפקד — כל-האיברים בתוקף" : `🟠/🔴 ${reds.length} איברים דורשים-תשומת-לב (מפורט-מטה; operator-triage מנהל את-תיקונם)`}

## טבלת-החיים
| פסק | איבר | קצב-מתוכנן | הרצה-אחרונה |
|---|---|---|---|
${flowsSorted.map((f) => `| ${badge[f.verdict] || "🟠"} ${f.verdict} | ${f.name} | ${cadenceOf(f)} | ${lastOf(f)} |`).join("\n")}

## למה — שורש-כל-אדום
${reds.length ? reds.map((f) => `- **${f.name}** (${f.verdict}): הרצה-אחרונה ${f.lastRun ? `${f.lastRun.conclusion || f.lastRun.status} @ ${f.lastRun.created_at} (${f.lastRun.event})` : "—"} — הלוגים ב-Actions; התיקון בתור operator-triage`).join("\n") : "- אין אדומים במחזור-זה."}

---
*חוק-העדות (R324): מילים אינן הוכחה. כל-פסק כאן נמדד מול-ה-API בריצה-זו ונכתב-בגיט. המפעיל לא נדרש לגלות קריסות במייל — הרשת מדווחת על-עצמה כל-30 דק.*
`;

  // 4) כתיבה + קומיט FF-only עם-yield
  const dir = path.join(process.cwd(), "state", "system-map");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "system-map.json"), JSON.stringify(map, null, 2));
  fs.writeFileSync(path.join(dir, "SYSTEM-MAP.md"), md);
  let committed = false;
  try {
    execFileSync("git", ["config", "user.name", "roshpinacare-sys"]);
    execFileSync("git", ["config", "user.email", "326012154+roshpinacare-sys@users.noreply.github.com"]);
    execFileSync("git", ["add", "state/system-map/"], { stdio: "pipe" });
    let staged = false;
    try { execFileSync("git", ["diff", "--cached", "--quiet"], { stdio: "pipe" }); } catch { staged = true; }
    if (staged) {
      execFileSync("git", ["commit", "-m", `system-map: the network sees itself — ${map.summary.alive} alive / ${map.summary.red} red / heartbeat ${map.heartbeat.verdict} [skip ci]`], { stdio: "pipe" });
      for (let i = 1; i <= 3; i++) {
        try {
          execFileSync("git", ["pull", "--rebase", "origin", "main"], { stdio: "pipe" });
          execFileSync("git", ["push", "origin", "HEAD:main"], { stdio: "pipe" });
          committed = true;
          break;
        } catch {
          try { execFileSync("git", ["rebase", "--abort"], { stdio: "pipe" }); } catch {}
          try { execFileSync("git", ["checkout", "--", "."], { stdio: "pipe" }); } catch {}
          execFileSync("sleep", [String(i * 5)]);
        }
      }
    } else {
      console.log("system-map: no change — map identical, clean exit");
    }
  } catch (e) {
    console.error("system-map: git layer fail-soft:", (e && e.message) || e);
  }

  console.log(`SYSTEM-MAP: alive=${map.summary.alive} red=${map.summary.red} stale=${map.summary.stale} heartbeat=${map.heartbeat.verdict} committed=${committed}`);
  for (const f of flowsSorted) if (f.verdict !== "ALIVE") console.log(`  ${f.verdict}: ${f.name} (${f.lastRun ? `${f.lastRun.conclusion || f.lastRun.status} @ ${f.lastRun.created_at}` : "no runs"})`);
  process.exit(0); // fail-soft: המפה לעולם לא מפילה-זרימה
}

main();
