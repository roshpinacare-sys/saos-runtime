# מפת-המשרד החיה — הרשת רואה את עצמה

נבנתה אוטונומית: **2026-10-18T07:39:44.003Z** · מאגר: `roshpinacare-sys/saos-runtime` · העדה = קומיט זה.

## פסק-על
- **דופק-הצאצא** (state push-back ל-roshpinacare-sys/steem@saos-cockpit): **לפני 10 דק** — ALIVE
  - «scout-ledger: discovery memory update (2026-10-18T07:29Z) [auto]»
- **איברים**: 🟢 חיים 11 · 🔴 אדומים 2 · 🟡 נעדרי-דופק 2 · 🟠 בוטלים 1 · 🔵 צופים-לטריגר 9 · ⚪ שער 0 · ⚫ לא-רצו-מעולם 0
- **פסק המשרד**: 🟠/🔴 5 איברים דורשים-תשומת-לב (מפורט-מטה; operator-triage מנהל את-תיקונם)

## טבלת-החיים
| פסק | איבר | קצב-מתוכנן | הרצה-אחרונה |
|---|---|---|---|
| 🔴 RED | dex-beat | כל 1 שע | 2026-10-18T05:54:31Z · workflow_dispatch · failure |
| 🔴 RED | escrow-payroll | dispatch-בלבד | 2026-10-18T05:16:04Z · workflow_dispatch · failure |
| 🟠 CANCELLED | grid-watchdog | dispatch-בלבד | 2026-10-18T07:39:35Z · workflow_dispatch · cancelled |
| 🟡 STALE | arb-grid | כל 1 שע | 2026-10-18T01:37:13Z · workflow_dispatch · success |
| 🟡 STALE | army-ladder | כל 1 שע | 2026-10-18T03:18:06Z · workflow_dispatch · success |
| 🟢 ALIVE | builder-catchup | dispatch-בלבד | 2026-10-18T05:25:44Z · workflow_dispatch · success |
| 🟢 ALIVE | custody-recover | dispatch-בלבד | 2026-10-18T07:39:36Z · workflow_dispatch · in_progress |
| 🟢 ALIVE | fee-engine | dispatch-בלבד | 2026-10-18T05:08:54Z · workflow_dispatch · success |
| 🟢 ALIVE | operator-triage | dispatch-בלבד | 2026-10-18T07:39:23Z · issues · success |
| 🟢 ALIVE | owner-powerdown | dispatch-בלבד | 2026-10-18T05:16:06Z · workflow_dispatch · success |
| 🟢 ALIVE | sovereign-builder | dispatch-בלבד | 2026-10-18T07:24:53Z · workflow_dispatch · success |
| 🟢 ALIVE | sovereign-evolution | כל 1 יום | 2026-10-17T21:09:15Z · workflow_dispatch · success |
| 🟢 ALIVE | sovereign-pulse | dispatch-בלבד | 2026-10-18T05:58:14Z · schedule · success |
| 🟢 ALIVE | sovereign-runtime | dispatch-בלבד | 2026-10-18T07:39:23Z · workflow_dispatch · in_progress |
| 🟢 ALIVE | system-map | dispatch-בלבד | 2026-10-18T07:39:33Z · workflow_dispatch · in_progress |
| 🟢 ALIVE | treasury-ladder | כל 6 שע | 2026-10-18T00:38:21Z · workflow_dispatch · success |
| 🔵 IDLE | blurt-revival | dispatch-בלבד | 2026-10-18T00:38:07Z · workflow_dispatch · success |
| 🔵 IDLE | directive-now | dispatch-בלבד | 2026-10-17T04:32:50Z · workflow_dispatch · success |
| 🔵 IDLE | fleet-fuel | dispatch-בלבד | 2026-10-18T03:16:16Z · workflow_dispatch · success |
| 🔵 IDLE | fleet-rotation-a | dispatch-בלבד | 2026-10-18T01:07:11Z · workflow_dispatch · success |
| 🔵 IDLE | gen2-rotation | dispatch-בלבד | 2026-10-18T00:38:18Z · workflow_dispatch · success |
| 🔵 IDLE | ghidra-lab | dispatch-בלבד | 2026-10-18T02:05:48Z · workflow_dispatch · success |
| 🔵 IDLE | hive-custody-revival | dispatch-בלבד | 2026-10-17T06:16:39Z · workflow_dispatch · success |
| 🔵 IDLE | owner-key-adopt | dispatch-בלבד | 2026-10-12T16:48:45Z · workflow_dispatch · success |
| 🔵 IDLE | self-memory | dispatch-בלבד | 2026-10-16T11:50:09Z · schedule · success |

## למה — שורש-כל-אדום
- **dex-beat** (RED): הרצה-אחרונה failure @ 2026-10-18T05:54:31Z (workflow_dispatch) — הלוגים ב-Actions; התיקון בתור operator-triage
- **escrow-payroll** (RED): הרצה-אחרונה failure @ 2026-10-18T05:16:04Z (workflow_dispatch) — הלוגים ב-Actions; התיקון בתור operator-triage
- **grid-watchdog** (CANCELLED): הרצה-אחרונה cancelled @ 2026-10-18T07:39:35Z (workflow_dispatch) — הלוגים ב-Actions; התיקון בתור operator-triage
- **arb-grid** (STALE): הרצה-אחרונה success @ 2026-10-18T01:37:13Z (workflow_dispatch) — הלוגים ב-Actions; התיקון בתור operator-triage
- **army-ladder** (STALE): הרצה-אחרונה success @ 2026-10-18T03:18:06Z (workflow_dispatch) — הלוגים ב-Actions; התיקון בתור operator-triage

---
*חוק-העדות (R324): מילים אינן הוכחה. כל-פסק כאן נמדד מול-ה-API בריצה-זו ונכתב-בגיט. המפעיל לא נדרש לגלות קריסות במייל — הרשת מדווחת על-עצמה כל-30 דק.*
