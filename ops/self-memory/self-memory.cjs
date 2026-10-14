#!/usr/bin/env node
// SELF-MEMORY — הרשת זוכרת את עצמה (R324 · מחקר-ענקים: Eliza LongTermMemory).
// ══════════════════════════════════════════════════════════════════════════════════════════
// מבוסס-קריאה-אמיתית של elizaOS/eliza packages/core/src/types/long-term-memory.ts:
//   • שלוש-קטגוריות: EPISODIC (מה-קרה) · SEMANTIC (מה-אנחנו-יודעים) · PROCEDURAL (מה-אנחנו-יודעים-לעשות).
//   • MemoryExtraction {category, content, confidence, source, metadata} + סף-ביטחון (MemoryConfig).
//   • חיזוק-זיכרון: רשומה-נגישה-שוב מקבלת accessCount++ ו-lastAccessedAt (בלי-ווקטורים —
//     דמיון Jaccard על-טוקנים; כנות: אין-DB-וקטורי בגיט, זו-החלפה-כנה לא-מילה-מתחכמת).
//   • קונסולידציה: רשומות ישנות-ולא-נגישות נשרפות (הזיכרון נשאר חד).
// מקורות (אפס-סודות, אפס-API-חובה): state/system-map/system-map.json · learning/ledger.jsonl ·
//   learning/evolution-*.json · מפקד-יכולות מ-.github/workflows + ops/ + scripts/.
// העדה = קומיט (אותו-דפוס-FF-only של system-map). fail-soft: יוצא 0 תמיד — אף-מייל לא נוצר כאן.
'use strict';
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "state", "self-memory");
const DRY = process.argv.includes("--dry-run");

// MemoryConfig — הידרות הספים (שמות זהים-ברוח ל-Eliza MemoryConfig)
const CONFIG = {
  longTermExtractionEnabled: true,
  longTermConfidenceThreshold: 0.55, // מתחת לזה — לא-נזכרים (כנות: רעש לא נהיה זיכרון)
  longTermSimilarityThreshold: 0.72, // מעל לזה — אותה-רשומה (חיזוק, לא כפילות)
  longTermExtractionIntervalHours: 6, // קצב-ה-extraction של ה-workflow (cron תואם)
  consolidationMaxAgeDays: 30,        // ותיקה-ולא-נגישה → נשרפת
};

const sha = (s) => crypto.createHash("sha256").update(String(s)).digest("hex").slice(0, 16);
const nowIso = () => new Date().toISOString();
const tokens = (s) =>
  new Set(String(s).toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, " ").split(/\s+/).filter((w) => w.length >= 3));
function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}
const readIf = (p) => { try { return fs.readFileSync(path.join(ROOT, p), "utf8"); } catch { return ""; } };

// ── שליפות (Extraction) — כל-מקור נכשל-רך ומדווח-חסר-בכנות ──────────────────────────────
function extractFromSystemMap(out) {
  const raw = readIf("state/system-map/system-map.json");
  if (!raw) return;
  try {
    const m = JSON.parse(raw);
    const s = m.summary || {};
    const hb = m.heartbeat || {};
    out.push({
      category: "EPISODIC",
      content: `מפת-המשרד (${m.builtAt || "—"}): חיים=${s.alive ?? "?"} אדומים=${s.red ?? "?"} נעדרי-דופק=${s.stale ?? "?"} · דופק-הצאצא ${hb.verdict || "—"}${hb.ageMinutes != null ? ` לפני ${hb.ageMinutes} דק` : ""} (${hb.repo || "—"}@${hb.branch || "—"})`,
      confidence: 0.92,
      source: "state/system-map/system-map.json",
      metadata: { builtAt: m.builtAt || null, summary: s, heartbeat: hb.verdict || null },
    });
    for (const f of m.flows || []) {
      if (f.verdict && f.verdict !== "ALIVE") {
        out.push({
          category: "EPISODIC",
          content: `זרימה-לא-חיה: ${f.name} · פסק ${f.verdict}${f.lastRun ? ` · ריצה-אחרונה ${f.lastRun.conclusion || f.lastRun.status} @ ${f.lastRun.created_at} (${f.lastRun.event})` : ""}`,
          confidence: 0.85,
          source: "state/system-map/system-map.json",
          metadata: { flow: f.name, verdict: f.verdict },
        });
      }
    }
  } catch { /* כנות: מפה לא-קריאה — לא ממציאים זיכרון */ }
}

function extractFromLedger(out) {
  const raw = readIf("learning/ledger.jsonl");
  if (!raw) return;
  const lines = raw.trim().split("\n").filter(Boolean).slice(-20);
  const ok = [];
  for (const ln of lines) {
    try {
      const j = JSON.parse(ln);
      if (j && j.verdict) ok.push(`${(j.at || "").slice(0, 16)} ${j.verdict}${Array.isArray(j.slos) ? ` [${j.slos.join(",")}]` : ""}`);
    } catch { /* שורה-רעה — מדלגים, לא קורסים */ }
  }
  if (ok.length) {
    out.push({
      category: "EPISODIC",
      content: `דופק-SLO אחרון (${ok.length} מדידות): ${ok[ok.length - 1]}`,
      confidence: 0.7,
      source: "learning/ledger.jsonl",
      metadata: { tail: ok.slice(-6) },
    });
  }
}

function extractFromEvolution(out) {
  let latest = null, latestName = "";
  try {
    for (const f of fs.readdirSync(path.join(ROOT, "learning"))) {
      if (/^evolution-\d{4}-\d{2}-\d{2}\.json$/.test(f) && (!latestName || f > latestName)) { latestName = f; latest = f; }
    }
  } catch { return; }
  if (!latest) return;
  try {
    const e = JSON.parse(readIf(`learning/${latest}`));
    const runs = (e.sections && e.sections.runs) || {};
    const rows = Object.entries(runs).map(([repo, r]) =>
      `${repo}: ${r.error ? `שגיאת-מדידה (${String(r.error).slice(0, 60)})` : `${(r.hist && r.hist.success) || 0} ירוק / ${(r.hist && r.hist.failure) || 0} אדום / ${(r.hist && r.hist.cancelled) || 0} בוטלים מתוך ${r.count || "?"}`}`);
    if (rows.length) {
      out.push({
        category: "SEMANTIC",
        content: `ידע-על-הצי (חלון ${e.window ? `${e.window.from}→${e.window.to}` : "?"}): ${rows.join(" · ")}`,
        confidence: 0.75,
        source: `learning/${latest}`,
        metadata: { file: latest, at: e.at || null },
      });
    }
  } catch { /* כנות: דיגסט לא-קריא */ }
}

function extractCapabilities(out) {
  let flows = [];
  try { const m = JSON.parse(readIf("state/system-map/system-map.json")); flows = (m.flows || []).map((f) => ({ name: f.name, verdict: f.verdict, gap: f.gapMinutes })); } catch {}
  let wf = [];
  try { wf = fs.readdirSync(path.join(ROOT, ".github", "workflows")).filter((f) => f.endsWith(".yml")); } catch {}
  let ops = [];
  try { ops = fs.readdirSync(path.join(ROOT, "ops")).filter((d) => fs.statSync(path.join(ROOT, "ops", d)).isDirectory()); } catch {}
  if (wf.length) {
    const withVerdict = flows.length ? wf.map((w) => `${w.replace(/\.yml$/, "")}:${(flows.find((f) => f.name === w.replace(/\.yml$/, "")) || {}).verdict || "ללא-מפה"}`).join(", ") : wf.join(", ");
    out.push({
      category: "PROCEDURAL",
      content: `מפקד-יכולות (${wf.length} זרימות מתוזמנות, ${ops.length} תיקיות-ops): ${withVerdict} · ops: ${ops.join(", ")}`,
      confidence: 0.88,
      source: ".github/workflows + ops/",
      metadata: { workflows: wf, opsDirs: ops },
    });
  }
}

// ── מיזוג (Consolidation) — זהות / דמיון → חיזוק; חדש → הצטרפות; ישן-נשכח → שריפה ──
function consolidate(prevRecords, candidates) {
  const recs = Array.isArray(prevRecords) ? prevRecords.map((r) => ({ ...r, _tok: tokens(r.content) })) : [];
  let reinforced = 0, added = 0, rejected = 0;
  for (const c of candidates) {
    if (!CONFIG.longTermExtractionEnabled) break;
    if (c.confidence < CONFIG.longTermConfidenceThreshold) { rejected++; continue; }
    const tok = tokens(c.content);
    const exact = recs.find((r) => r.category === c.category && r.id === sha(c.content));
    let twin = exact;
    if (!twin) {
      const best = recs.map((r) => ({ r, sim: jaccard(r._tok, tok) })).sort((x, y) => y.sim - x.sim)[0];
      if (best && best.sim >= CONFIG.longTermSimilarityThreshold) twin = best.r;
    }
    if (twin) {
      twin.accessCount = (twin.accessCount || 1) + 1;
      twin.lastAccessedAt = nowIso();
      twin.confidence = Math.max(twin.confidence || 0, c.confidence);
      reinforced++;
    } else {
      recs.push({ id: sha(c.content), category: c.category, content: c.content,
        confidence: c.confidence, source: c.source, metadata: c.metadata || {},
        createdAt: nowIso(), lastAccessedAt: nowIso(), accessCount: 1, _tok: tok });
      added++;
    }
  }
  const cut = Date.now() - CONFIG.consolidationMaxAgeDays * 864e5;
  const kept = recs.filter((r) => new Date(r.createdAt).getTime() >= cut || (r.accessCount || 1) > 1);
  const burned = recs.length - kept.length;
  return { records: kept, stats: { candidates: candidates.length, added, reinforced, rejected, burned } };
}

const CAT_TITLE = { EPISODIC: "אפיזודי — מה קרה", SEMANTIC: "סמנטי — מה אנחנו יודעים", PROCEDURAL: "פרוצדורלי — מה אנחנו יודעים לעשות" };

function buildMarkdown(mem) {
  const rank = { EPISODIC: 0, SEMANTIC: 1, PROCEDURAL: 2 };
  const byCat = {};
  for (const r of mem.records) (byCat[r.category] = byCat[r.category] || []).push(r);
  const rows = Object.keys(CAT_TITLE).sort((a, b) => rank[a] - rank[b]).map((cat) => {
    const list = (byCat[cat] || []).sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
    return `## ${CAT_TITLE[cat]} — ${list.length} רשומות\n` + (list.length
      ? list.map((r) => `- **[${Math.round((r.confidence || 0) * 100)}%]** ${r.content}\n  · ניגש ${r.accessCount || 1}×, אחרון ${(r.lastAccessedAt || r.createdAt || "").slice(0, 16)} · מקור: ${r.source}`).join("\n")
      : "- (ריק בכנות — אין-ראיה מספיקה)");
  }).join("\n\n");
  return `# הזיכרון-העצמי של הרשת — הרשת זוכרת מה היא יודעת ומה היא יכולה

נבנה אוטונומית: **${mem.builtAt}** · תבנית: Eliza LongTermMemory (EPISODIC/SEMANTIC/PROCEDURAL) על-גיט — העדה = קומיט זה.

## ספים (MemoryConfig)
- סף-ביטחון ${CONFIG.longTermConfidenceThreshold} · סף-דמיון ${CONFIG.longTermSimilarityThreshold} · קצב-extraction כל ${CONFIG.longTermExtractionIntervalHours} שע · קונסולידציה אחרי ${CONFIG.consolidationMaxAgeDays} יום-של-אי-גישה

## מדידת-המחזור
- מועמדים ${mem.stats.candidates} · נוספו ${mem.stats.added} · חוזקו ${mem.stats.reinforced} · נדחו-ביטחון ${mem.stats.rejected} · נשרפו-נשכחים ${mem.stats.burned}

${rows}

---
*חוק-הזיכרון (R324): הרשת שאינה זוכרת אינה ריבונית. כל-רשומה כאן נשאבת מראיות-בגיט בריצה-זו; ביטחון נמוך לא נהיה זיכרון; כפילות מתחזקת-במקום-להיצבר; נשכחים נשרפים. אפס-סודות.*
`;
}

function main() {
  const candidates = [];
  try { extractFromSystemMap(candidates); } catch (e) { console.error("extraction system-map fail-soft:", e.message); }
  try { extractFromLedger(candidates); } catch (e) { console.error("extraction ledger fail-soft:", e.message); }
  try { extractFromEvolution(candidates); } catch (e) { console.error("extraction evolution fail-soft:", e.message); }
  try { extractCapabilities(candidates); } catch (e) { console.error("extraction capabilities fail-soft:", e.message); }

  let prev = { records: [] };
  try { prev = JSON.parse(readIf("state/self-memory/self-memory.json")) || prev; } catch { /* ריצה-ראשונה כנה */ }

  const { records, stats } = consolidate(prev.records, candidates);
  const mem = { builtAt: nowIso(), config: CONFIG, stats, records };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "self-memory.json"), JSON.stringify(mem, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "SELF-MEMORY.md"), buildMarkdown(mem));

  let committed = false;
  if (!DRY) {
    try {
      execFileSync("git", ["config", "user.name", "roshpinacare-sys"]);
      execFileSync("git", ["config", "user.email", "326012154+roshpinacare-sys@users.noreply.github.com"]);
      execFileSync("git", ["add", "state/self-memory/"], { stdio: "pipe" });
      let staged = false;
      try { execFileSync("git", ["diff", "--cached", "--quiet"], { stdio: "pipe" }); } catch { staged = true; }
      if (staged) {
        execFileSync("git", ["commit", "-m", `self-memory: the network remembers — +${stats.added} new / ${stats.reinforced} reinforced / ${stats.burned} forgotten (${records.length} records) [skip ci]`], { stdio: "pipe" });
        for (let i = 1; i <= 3; i++) {
          try {
            execFileSync("git", ["pull", "--rebase", "origin", "main"], { stdio: "pipe" });
            execFileSync("git", ["push", "origin", "HEAD:main"], { stdio: "pipe" });
            committed = true;
            break;
          } catch {
            try { execFileSync("git", ["rebase", "--abort"], { stdio: "pipe" }); } catch {}
            execFileSync("sleep", [String(i * 5)]);
          }
        }
      } else {
        console.log("self-memory: no change — memory identical, clean exit");
      }
    } catch (e) {
      console.error("self-memory: git layer fail-soft:", (e && e.message) || e);
    }
  }

  console.log(`SELF-MEMORY: records=${records.length} added=${stats.added} reinforced=${stats.reinforced} rejected=${stats.rejected} burned=${stats.burned} committed=${committed}${DRY ? " (dry-run)" : ""}`);
  process.exit(0); // fail-soft: הזיכרון לעולם לא מפיל-זרימה
}

main();
