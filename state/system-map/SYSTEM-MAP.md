# מפת-המשרד החיה — הרשת רואה את עצמה

נבנתה אוטונומית: **2026-10-23T10:32:02.709Z** · מאגר: `roshpinacare-sys/saos-runtime` · העדה = קומיט זה.

## פסק-על
- **דופק-הצאצא** (state push-back ל-roshpinacare-sys/steem@saos-cockpit): **לפני 10 דק** — ALIVE
  - «beat verdict: state via API last-mile (survives reconcile races)»
- **איברים**: 🟢 חיים 22 · 🔴 אדומים 0 · 🟡 נעדרי-דופק 0 · 🟠 בוטלים 1 · 🔵 צופים-לטריגר 14 · ⚪ שער 0 · ⚫ לא-רצו-מעולם 0
- **פסק המשרד**: 🟠/🔴 1 איברים דורשים-תשומת-לב (מפורט-מטה; operator-triage מנהל את-תיקונם)

## טבלת-החיים
| פסק | איבר | קצב-מתוכנן | הרצה-אחרונה |
|---|---|---|---|
| 🟠 CANCELLED | grid-watchdog | כל 30 דק | 2026-10-23T10:30:07Z · schedule · cancelled |
| 🟢 ALIVE | agent-9-vault-sync | כל 1 יום | 2026-10-23T08:43:53Z · schedule · success |
| 🟢 ALIVE | arb-grid | כל 1 שע | 2026-10-23T07:41:24Z · schedule · success |
| 🟢 ALIVE | army-ladder | כל 1 שע | 2026-10-23T09:58:57Z · schedule · in_progress |
| 🟢 ALIVE | arsenal-sentinel | כל 1 יום | 2026-10-23T05:14:58Z · schedule · success |
| 🟢 ALIVE | blurt-revival | כל 1 שע | 2026-10-23T07:44:06Z · schedule · success |
| 🟢 ALIVE | custody-recover | כל 1 יום | 2026-10-23T08:48:38Z · schedule · success |
| 🟢 ALIVE | dex-beat | כל 1 שע | 2026-10-23T09:54:30Z · workflow_dispatch · in_progress |
| 🟢 ALIVE | escrow-payroll | dispatch-בלבד | 2026-10-23T10:14:13Z · workflow_dispatch · success |
| 🟢 ALIVE | fee-engine | כל 1 יום | 2026-10-23T09:25:08Z · workflow_dispatch · success |
| 🟢 ALIVE | fleet-fuel | dispatch-בלבד | 2026-10-23T10:14:09Z · workflow_dispatch · success |
| 🟢 ALIVE | main-key-refresh | כל 7 יום | 2026-10-19T10:14:18Z · schedule · success |
| 🟢 ALIVE | operator-triage | כל 1 יום | 2026-10-22T16:18:52Z · issues · success |
| 🟢 ALIVE | organ-guardian | כל 1 שע | 2026-10-23T07:54:17Z · schedule · success |
| 🟢 ALIVE | organ-pacemaker | כל 1 שע | 2026-10-23T10:13:39Z · schedule · success |
| 🟢 ALIVE | self-memory | כל 1 יום | 2026-10-23T05:17:57Z · schedule · success |
| 🟢 ALIVE | signing-health (runtime-host) | כל 1 שע | 2026-10-23T07:56:03Z · schedule · success |
| 🟢 ALIVE | sovereign-evolution | כל 1 יום | 2026-10-23T10:22:34Z · schedule · success |
| 🟢 ALIVE | sovereign-pulse | dispatch-בלבד | 2026-10-23T09:36:07Z · schedule · success |
| 🟢 ALIVE | sovereign-runtime | כל 1 שע | 2026-10-23T10:24:52Z · workflow_dispatch · in_progress |
| 🟢 ALIVE | steem-hand-revival | כל 1 יום | 2026-10-23T07:47:00Z · schedule · success |
| 🟢 ALIVE | system-map | כל 30 דק | 2026-10-23T10:31:50Z · schedule · in_progress |
| 🟢 ALIVE | treasury-ladder | כל 6 שע | 2026-10-23T08:51:26Z · schedule · success |
| 🔵 IDLE | builder-catchup | dispatch-בלבד | 2026-10-23T06:32:52Z · schedule · success |
| 🔵 IDLE | cross-custody-probe | dispatch-בלבד | 2026-10-18T13:28:18Z · workflow_dispatch · success |
| 🔵 IDLE | directive-now | dispatch-בלבד | 2026-10-22T15:23:54Z · workflow_dispatch · success |
| 🔵 IDLE | fleet-rotation-a | dispatch-בלבד | 2026-10-18T01:07:11Z · workflow_dispatch · success |
| 🔵 IDLE | gen2-rotation | dispatch-בלבד | 2026-10-18T00:38:18Z · workflow_dispatch · success |
| 🔵 IDLE | ghidra-lab | dispatch-בלבד | 2026-10-18T02:05:48Z · workflow_dispatch · success |
| 🔵 IDLE | hive-adopt-t21 | dispatch-בלבד | 2026-10-19T01:01:47Z · workflow_dispatch · success |
| 🔵 IDLE | hive-custody-revival | dispatch-בלבד | 2026-10-19T03:12:42Z · workflow_dispatch · success |
| 🔵 IDLE | key-relay-to-autonomy | dispatch-בלבד | 2026-10-21T02:48:01Z · workflow_dispatch · success |
| 🔵 IDLE | owner-key-adopt | dispatch-בלבד | 2026-10-18T13:34:10Z · workflow_dispatch · success |
| 🔵 IDLE | owner-powerdown | dispatch-בלבד | 2026-10-18T05:16:06Z · workflow_dispatch · success |
| 🔵 IDLE | sovereign-builder | dispatch-בלבד | 2026-10-23T04:56:38Z · schedule · success |
| 🔵 IDLE | treasury-consolidation | dispatch-בלבד | 2026-10-21T02:51:26Z · workflow_dispatch · success |
| 🔵 IDLE | vault-owner-adopt | dispatch-בלבד | 2026-10-19T17:51:21Z · workflow_dispatch · success |

## למה — שורש-כל-אדום
- **grid-watchdog** (CANCELLED): הרצה-אחרונה cancelled @ 2026-10-23T10:30:07Z (schedule) — הלוגים ב-Actions; התיקון בתור operator-triage

---
*חוק-העדות (R324): מילים אינן הוכחה. כל-פסק כאן נמדד מול-ה-API בריצה-זו ונכתב-בגיט. המפעיל לא נדרש לגלות קריסות במייל — הרשת מדווחת על-עצמה כל-30 דק.*
