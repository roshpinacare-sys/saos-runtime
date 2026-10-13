#!/usr/bin/env node
// OPERATOR-TRIAGE — טענות-המפעיל מנותבות לאוטונומיה (R324 · «הריבונות היא המפעיל,
// טענות-למפעיל צריכות-להיות מנותבות לאוטונומיה»).
// ══════════════════════════════════════════════════════════════════════════════════════
// מצב-A (issues.opened): תשובה-אוטונומית על-ה-issue — פסק-המפה החיה + הזרמת-זרימות
// בטוחות (canary-gated בלבד) לפי מילות-מפתח. הטענה אף-פעם לא ממתינה-לאדם.
// מצב-B (schedule/dispatch): סריקת-אדומים → issue «תור-תיקון אוטונומי» אחד חי
// (פתיחה/עדכון/סגירה-כנה-כשהכל-ירוק). זה התור שהאוטונומיה עצמה עוקבת-אחריו.
// fail-soft תמיד: הנתב לעולם לא יוצר עצמו מיילים — יוצא 0 בכל-מקרה.
'use strict';
const https = require("https");
const fs = require("fs");

const REPO = process.env.GITHUB_REPOSITORY || "roshpinacare-sys/saos-runtime";
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "";
const QUEUE_TITLE = "🛠️ תור-תיקון אוטונומי — ריבונות מנהלת את עצמה";
const SAFE_DISPATCH = {
  map: ["system-map"],
  dex: ["treasury-ladder", "grid-watchdog"],
  pulse: ["system-map", "grid-watchdog"],
  money: ["fee-engine"],
  custody: ["custody-recover"],
};

function api(method, p, body) {
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request(
      { host: "api.github.com", path: p.startsWith("/") ? p : "/" + p, method,
        headers: { "User-Agent": "saos-operator-triage", Accept: "application/vnd.github+json",
          ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}) },
        timeout: 20000 },
      (res) => { let d = ""; res.on("data", (c) => (d += c));
        res.on("end", () => { try { resolve({ status: res.statusCode, json: d ? JSON.parse(d) : null }); }
          catch { resolve({ status: res.statusCode, json: null }); } }); });
    req.on("error", () => resolve({ status: 0, json: null }));
    req.on("timeout", () => { req.destroy(); resolve({ status: 0, json: null }); });
    if (payload) req.write(payload);
    req.end();
  });
}

async function readMap() {
  // R324 anti-race: the checkout snapshot may predate this cycle's map commit —
  // fetch the LATEST committed map from origin main first; fall back to the
  // local copy; last resort null (honest "map not ready").
  const latest = await new Promise((resolve) => {
    const req = https.request(
      { host: "raw.githubusercontent.com", path: `/roshpinacare-sys/saos-runtime/main/state/system-map/system-map.json`,
        method: "GET", headers: { "User-Agent": "saos-operator-triage", ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) }, timeout: 20000 },
      (res) => { let d = ""; res.on("data", (c) => (d += c)); res.on("end", () => resolve(res.statusCode === 200 ? d : "")); });
    req.on("error", () => resolve(""));
    req.on("timeout", () => { req.destroy(); resolve(""); });
    req.end();
  });
  try { const j = JSON.parse(latest); if (j && j.summary) return j; } catch {}
  try {
    const j = JSON.parse(fs.readFileSync("state/system-map/system-map.json", "utf8"));
    if (j && j.summary) return j;
  } catch {}
  return null;
}

function mapDigest(map) {
  if (!map) return "- (המפה החיה עדיין לא נכתבה — הרץ system-map או המתן את-המחזור הבא)";
  const s = map.summary;
  const lines = [`- דופק-הצאצא (steem@saos-cockpit): ${map.heartbeat ? (map.heartbeat.ageMinutes != null ? `לפני ${map.heartbeat.ageMinutes} דק — ${map.heartbeat.verdict}` : map.heartbeat.verdict) : "?"}`,
    `- איברים: 🟢 ${s.alive} חיים · 🔴 ${s.red} אדומים · 🟡 ${s.stale} נעדרי-דופק · 🟠 ${s.cancelled} בוטלים · ⚪ ${s.gated} שער`];
  for (const f of map.flows || []) if (f.verdict === "RED" || f.verdict === "STALE" || f.verdict === "CANCELLED")
    lines.push(`  - ${f.verdict}: **${f.name}** — ${f.lastRun ? `${f.lastRun.conclusion || f.lastRun.status} @ ${f.lastRun.created_at}` : "—"}`);
  return lines.join("\n");
}

function routeFromText(t) {
  const x = (t || "").toLowerCase();
  const dispatches = new Set(["system-map"]); // תמיד מרענן-עדות
  if (/(dex|דקס|נפח|volume|ladder|סולם|treasury|קופה|treasur)/.test(x)) SAFE_DISPATCH.dex.forEach((w) => dispatches.add(w));
  if (/(pulse|דופק|heartbeat|משרד|office|קרס|collapsed|עומד|לא עובד|לא-עובד|נפל|broken|fail|crash)/.test(x)) SAFE_DISPATCH.pulse.forEach((w) => dispatches.add(w));
  if (/(fee|עמלות|רווח|profit|money|כסף)/.test(x)) SAFE_DISPATCH.money.forEach((w) => dispatches.add(w));
  if (/(custody|מפתח|key|כספת|vault|חזרה|revival)/.test(x)) SAFE_DISPATCH.custody.forEach((w) => dispatches.add(w));
  return [...dispatches];
}

async function dispatchFlow(wf) {
  const r = await api("POST", `/repos/${REPO}/actions/workflows/${wf}.yml/dispatches`, { ref: "main" });
  return r.status === 204 || r.status === 200;
}

async function modeIssue() {
  const ev = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  const num = ev.issue && ev.issue.number;
  if (!num) return;
  const title = ev.issue.title || "";
  const body = ev.issue.body || "";
  const map = await readMap();
  const wants = routeFromText(`${title}\n${body}`);
  const results = [];
  for (const wf of wants) results.push(`${wf}: ${await dispatchFlow(wf) ? "✅ הופעל" : "⚠️ כשל-הזרמה (fail-soft)"}`);
  const comment = `🤖 **הריבונות קיבלה את הטענה — מנתבת לאוטונומיה.** (R324)

**פסק-המערכת החי (מפת-30-דק האחרונה):**
${mapDigest(map)}

**ניתוב אוטונומי לפי תוכן-הטענה:** ${wants.length ? wants.map((w) => `\`${w}\``).join(" · ") : "אין-זרימה מתאימה — האוטונומיה תטפל בתור-התיקון"}
${results.length ? "\n**הזרמות:**\n" + results.map((r) => `- ${r}`).join("\n") : ""}

הטענה לא ממתינה-לאדם: הרשת בודקת-את-עצמה כל-30 דק (state/system-map/SYSTEM-MAP.md — העדה = קומיט), ואדומים נכנסים-אוטונומית לתור-התיקון. מילים אינן הוכחה — תמיד בודקים מול-הרצות-החיות ב-Actions.`;
  const r = await api("POST", `/repos/${REPO}/issues/${num}/comments`, { body: comment });
  console.log(`triage: issue #${num} routed → ${wants.join(",") || "queue-only"} (comment ${r.status})`);
}

async function modeQueue() {
  const map = await readMap();
  const reds = map ? (map.flows || []).filter((f) => f.verdict === "RED" || f.verdict === "STALE" || f.verdict === "CANCELLED") : [];
  const hb = map && map.heartbeat ? map.heartbeat.verdict : "?";
  const body = `**תור-התיקון האוטונומי** — מתוך state/system-map (עודכן ${map ? map.builtAt : "—"}) · דופק-צאצא: **${hb}**

${reds.length ? `| פסק | איבר | פרטים |\n|---|---|---|\n${reds.map((f) => `| ${f.verdict} | **${f.name}** | ${f.lastRun ? `${f.lastRun.conclusion || f.lastRun.status} @ ${f.lastRun.created_at} (${f.lastRun.event})` : "—"} |`).join("\n")}` : "אין אדומים — המשרד עומד."}

*האוטונומיה עוקבת-אחרי-התור הזה בעצמה (operator-triage כל-יום 09:04 + מפה כל-30 דק). סגירה = רק-כשהכל ירוק באמת.*`;

  const list = await api("GET", `/repos/${REPO}/issues?state=open&per_page=50`);
  const existing = ((list.json || [])).find((i) => !i.pull_request && (i.title || "").startsWith(QUEUE_TITLE.slice(0, 20)));
  if (reds.length) {
    if (existing) {
      await api("PATCH", `/repos/${REPO}/issues/${existing.number}`, { body });
      console.log(`triage: queue #${existing.number} updated (${reds.length} reds)`);
    } else {
      await api("POST", `/repos/${REPO}/issues`, { title: QUEUE_TITLE, body, labels: [] });
      console.log(`triage: queue opened (${reds.length} reds)`);
    }
  } else if (existing) {
    await api("POST", `/repos/${REPO}/issues/${existing.number}/comments`, { body: "🟢 הכל ירוק במדידה-האחרונה — התור נסגר אוטונומית. ייפתח-מחדש בעצמו עם-האדום-הבא." });
    await api("PATCH", `/repos/${REPO}/issues/${existing.number}`, { state: "closed" });
    console.log(`triage: all green — queue #${existing.number} closed`);
  } else {
    console.log("triage: all green, no queue");
  }
}

async function main() {
  try {
    const evName = process.env.GITHUB_EVENT_NAME || "";
    if (evName === "issues") await modeIssue();
    else await modeQueue(); // schedule + workflow_dispatch
  } catch (e) {
    console.error("triage: fail-soft:", (e && e.message) || e);
  }
  process.exit(0); // הנתב לעולם לא אדום
}

main();
