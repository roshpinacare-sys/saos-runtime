# מפת-המשרד החיה — הרשת רואה את עצמה

נבנתה אוטונומית: **2026-10-13T22:25:48.595Z** · מאגר: `roshpinacare-sys/saos-runtime` · העדה = קומיט זה.

## פסק-על
- **דופק-הצאצא** (state push-back ל-roshpinacare-sys/steem@saos-cockpit): **לפני 10 דק** — ALIVE
  - «SAOS-runtime-ci: heartbeat state (offline conversation + content) [ci]»
- **איברים**: 🟢 חיים 6 · 🔴 אדומים 1 · 🟡 נעדרי-דופק 5 · 🟠 בוטלים 1 · ⚪ שער 0 · ⚫ לא-רצו-מעולם 0
- **פסק המשרד**: 🟠/🔴 7 איברים דורשים-תשומת-לב (מפורט-מטה; operator-triage מנהל את-תיקונם)

## טבלת-החיים
| פסק | איבר | קצב-מתוכנן | הרצה-אחרונה |
|---|---|---|---|
| 🔴 RED | treasury-ladder | כל 12 שע | 2026-10-13T22:17:31Z · workflow_dispatch · failure |
| 🟠 CANCELLED | grid-watchdog | כל 30 דק | 2026-10-13T21:49:25Z · schedule · cancelled |
| 🟡 STALE | escrow-payroll | dispatch-בלבד | 2026-10-12T03:22:33Z · workflow_dispatch · success |
| 🟡 STALE | fleet-rotation-a | dispatch-בלבד | 2026-10-13T00:01:51Z · workflow_dispatch · success |
| 🟡 STALE | gen2-rotation | dispatch-בלבד | 2026-10-12T15:41:03Z · workflow_dispatch · success |
| 🟡 STALE | owner-key-adopt | dispatch-בלבד | 2026-10-12T16:48:45Z · workflow_dispatch · success |
| 🟡 STALE | sovereign-evolution | dispatch-בלבד | 2026-10-13T14:34:14Z · schedule · success |
| 🟢 ALIVE | blurt-revival | dispatch-בלבד | 2026-10-13T21:16:13Z · schedule · success |
| 🟢 ALIVE | custody-recover | כל 1 יום | 2026-10-13T11:04:00Z · schedule · success |
| 🟢 ALIVE | fee-engine | כל 1 יום | 2026-10-13T22:19:51Z · workflow_dispatch · success |
| 🟢 ALIVE | operator-triage | כל 1 יום | 2026-10-13T22:25:39Z · workflow_dispatch · in_progress |
| 🟢 ALIVE | sovereign-runtime | כל 1 שע | 2026-10-13T22:13:35Z · workflow_dispatch · in_progress |
| 🟢 ALIVE | system-map | כל 30 דק | 2026-10-13T22:25:37Z · workflow_dispatch · in_progress |

## למה — שורש-כל-אדום
- **treasury-ladder** (RED): הרצה-אחרונה failure @ 2026-10-13T22:17:31Z (workflow_dispatch) — הלוגים ב-Actions; התיקון בתור operator-triage
- **grid-watchdog** (CANCELLED): הרצה-אחרונה cancelled @ 2026-10-13T21:49:25Z (schedule) — הלוגים ב-Actions; התיקון בתור operator-triage
- **escrow-payroll** (STALE): הרצה-אחרונה success @ 2026-10-12T03:22:33Z (workflow_dispatch) — הלוגים ב-Actions; התיקון בתור operator-triage
- **fleet-rotation-a** (STALE): הרצה-אחרונה success @ 2026-10-13T00:01:51Z (workflow_dispatch) — הלוגים ב-Actions; התיקון בתור operator-triage
- **gen2-rotation** (STALE): הרצה-אחרונה success @ 2026-10-12T15:41:03Z (workflow_dispatch) — הלוגים ב-Actions; התיקון בתור operator-triage
- **owner-key-adopt** (STALE): הרצה-אחרונה success @ 2026-10-12T16:48:45Z (workflow_dispatch) — הלוגים ב-Actions; התיקון בתור operator-triage
- **sovereign-evolution** (STALE): הרצה-אחרונה success @ 2026-10-13T14:34:14Z (schedule) — הלוגים ב-Actions; התיקון בתור operator-triage

---
*חוק-העדות (R324): מילים אינן הוכחה. כל-פסק כאן נמדד מול-ה-API בריצה-זו ונכתב-בגיט. המפעיל לא נדרש לגלות קריסות במייל — הרשת מדווחת על-עצמה כל-30 דק.*
