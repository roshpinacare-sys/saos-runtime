# מפת-המשרד החיה — הרשת רואה את עצמה

נבנתה אוטונומית: **2026-10-22T13:48:50.030Z** · מאגר: `roshpinacare-sys/saos-runtime` · העדה = קומיט זה.

## פסק-על
- **דופק-הצאצא** (state push-back ל-roshpinacare-sys/steem@saos-cockpit): **לפני 10 דק** — ALIVE
  - «beat verdict: state via API last-mile (survives reconcile races)»
- **איברים**: 🟢 חיים 16 · 🔴 אדומים 0 · 🟡 נעדרי-דופק 5 · 🟠 בוטלים 1 · 🔵 צופים-לטריגר 15 · ⚪ שער 0 · ⚫ לא-רצו-מעולם 0
- **פסק המשרד**: 🟠/🔴 6 איברים דורשים-תשומת-לב (מפורט-מטה; operator-triage מנהל את-תיקונם)

## טבלת-החיים
| פסק | איבר | קצב-מתוכנן | הרצה-אחרונה |
|---|---|---|---|
| 🟠 CANCELLED | grid-watchdog | כל 30 דק | 2026-10-22T13:44:43Z · schedule · cancelled |
| 🟡 STALE | arb-grid | כל 1 שע | 2026-10-22T10:44:07Z · schedule · success |
| 🟡 STALE | blurt-revival | כל 1 שע | 2026-10-22T07:46:04Z · schedule · success |
| 🟡 STALE | organ-guardian | כל 1 שע | 2026-10-22T07:55:00Z · schedule · success |
| 🟡 STALE | organ-pacemaker | כל 1 שע | 2026-10-22T10:19:07Z · schedule · success |
| 🟡 STALE | signing-health (runtime-host) | כל 1 שע | 2026-10-22T07:57:31Z · schedule · success |
| 🟢 ALIVE | agent-9-vault-sync | כל 1 יום | 2026-10-22T08:47:50Z · schedule · success |
| 🟢 ALIVE | army-ladder | כל 1 שע | 2026-10-22T13:40:25Z · workflow_dispatch · in_progress |
| 🟢 ALIVE | arsenal-sentinel | כל 1 יום | 2026-10-22T12:17:11Z · schedule · success |
| 🟢 ALIVE | custody-recover | כל 1 יום | 2026-10-20T17:42:18Z · workflow_dispatch · success |
| 🟢 ALIVE | dex-beat | כל 1 שע | 2026-10-22T12:54:31Z · workflow_dispatch · in_progress |
| 🟢 ALIVE | fee-engine | כל 1 יום | 2026-10-22T13:39:21Z · workflow_dispatch · success |
| 🟢 ALIVE | main-key-refresh | כל 7 יום | 2026-10-19T10:14:18Z · schedule · success |
| 🟢 ALIVE | operator-triage | כל 1 יום | 2026-10-20T17:42:07Z · issues · success |
| 🟢 ALIVE | self-memory | כל 1 יום | 2026-10-22T12:21:00Z · schedule · success |
| 🟢 ALIVE | sovereign-builder | dispatch-בלבד | 2026-10-22T11:57:57Z · schedule · success |
| 🟢 ALIVE | sovereign-evolution | כל 1 יום | 2026-10-22T10:25:51Z · schedule · success |
| 🟢 ALIVE | sovereign-pulse | dispatch-בלבד | 2026-10-22T12:58:04Z · schedule · success |
| 🟢 ALIVE | sovereign-runtime | כל 1 שע | 2026-10-22T13:41:25Z · workflow_dispatch · in_progress |
| 🟢 ALIVE | steem-hand-revival | כל 1 יום | 2026-10-22T12:45:58Z · workflow_dispatch · success |
| 🟢 ALIVE | system-map | כל 30 דק | 2026-10-22T13:48:29Z · schedule · in_progress |
| 🟢 ALIVE | treasury-ladder | כל 6 שע | 2026-10-22T08:56:27Z · schedule · success |
| 🔵 IDLE | builder-catchup | dispatch-בלבד | 2026-10-22T10:40:31Z · schedule · success |
| 🔵 IDLE | cross-custody-probe | dispatch-בלבד | 2026-10-18T13:28:18Z · workflow_dispatch · success |
| 🔵 IDLE | directive-now | dispatch-בלבד | 2026-10-21T10:18:54Z · workflow_dispatch · success |
| 🔵 IDLE | escrow-payroll | dispatch-בלבד | 2026-10-22T05:30:47Z · workflow_dispatch · success |
| 🔵 IDLE | fleet-fuel | dispatch-בלבד | 2026-10-22T10:19:13Z · workflow_dispatch · success |
| 🔵 IDLE | fleet-rotation-a | dispatch-בלבד | 2026-10-18T01:07:11Z · workflow_dispatch · success |
| 🔵 IDLE | gen2-rotation | dispatch-בלבד | 2026-10-18T00:38:18Z · workflow_dispatch · success |
| 🔵 IDLE | ghidra-lab | dispatch-בלבד | 2026-10-18T02:05:48Z · workflow_dispatch · success |
| 🔵 IDLE | hive-adopt-t21 | dispatch-בלבד | 2026-10-19T01:01:47Z · workflow_dispatch · success |
| 🔵 IDLE | hive-custody-revival | dispatch-בלבד | 2026-10-19T03:12:42Z · workflow_dispatch · success |
| 🔵 IDLE | key-relay-to-autonomy | dispatch-בלבד | 2026-10-21T02:48:01Z · workflow_dispatch · success |
| 🔵 IDLE | owner-key-adopt | dispatch-בלבד | 2026-10-18T13:34:10Z · workflow_dispatch · success |
| 🔵 IDLE | owner-powerdown | dispatch-בלבד | 2026-10-18T05:16:06Z · workflow_dispatch · success |
| 🔵 IDLE | treasury-consolidation | dispatch-בלבד | 2026-10-21T02:51:26Z · workflow_dispatch · success |
| 🔵 IDLE | vault-owner-adopt | dispatch-בלבד | 2026-10-19T17:51:21Z · workflow_dispatch · success |

## למה — שורש-כל-אדום
- **grid-watchdog** (CANCELLED): הרצה-אחרונה cancelled @ 2026-10-22T13:44:43Z (schedule) — הלוגים ב-Actions; התיקון בתור operator-triage
- **arb-grid** (STALE): הרצה-אחרונה success @ 2026-10-22T10:44:07Z (schedule) — הלוגים ב-Actions; התיקון בתור operator-triage
- **blurt-revival** (STALE): הרצה-אחרונה success @ 2026-10-22T07:46:04Z (schedule) — הלוגים ב-Actions; התיקון בתור operator-triage
- **organ-guardian** (STALE): הרצה-אחרונה success @ 2026-10-22T07:55:00Z (schedule) — הלוגים ב-Actions; התיקון בתור operator-triage
- **organ-pacemaker** (STALE): הרצה-אחרונה success @ 2026-10-22T10:19:07Z (schedule) — הלוגים ב-Actions; התיקון בתור operator-triage
- **signing-health (runtime-host)** (STALE): הרצה-אחרונה success @ 2026-10-22T07:57:31Z (schedule) — הלוגים ב-Actions; התיקון בתור operator-triage

---
*חוק-העדות (R324): מילים אינן הוכחה. כל-פסק כאן נמדד מול-ה-API בריצה-זו ונכתב-בגיט. המפעיל לא נדרש לגלות קריסות במייל — הרשת מדווחת על-עצמה כל-30 דק.*
