# Grid status

Generated 2026-10-13T06:28:16Z by grid-watchdog (schedule 13,43 * * * * UTC). Cross-repo visibility: yes.

| Signal | Measured | Threshold | Status | Since |
|---|---|---|---|---|
| heartbeat.fresh | age=3m http=200 | age<=2400s (40m); missing/unparseable is red | GREEN | 2026-10-13T06:25:04.709Z |
| custody.coverage | verified=1/total=14 | verified>=14 | RED | 2026-10-13T06:25:04.709Z |
| social.verdict | verdict=PART-GATED executed=None refused=None | verdict in green set (anything else red) | RED | 2026-10-13T06:25:04.709Z |
| content.verdict | verdict=BRIDGE-DOWN draftsQueued=None | verdict in green set (anything else red) | RED | 2026-10-13T06:25:04.709Z |
| dex.anchor | verdict=STANDBY anchorAgeMs=unavailable | anchorAgeMs<=86400000 (24h) | UNAVAILABLE | 2026-10-13T06:25:04.709Z |
| blurt.live | verdict=BLURT-BODIES-LIVE live=None/None | live>=1 | RED | 2026-10-13T06:25:04.709Z |
| delegation.verdict | verdict=CUSTODY-GATE-REFUSED ops=None | verdict in green set (anything else red) | RED | 2026-10-13T06:25:04.709Z |
| digest.verdict | verdict=COOLDOWN slot=None | verdict in green set (COOLDOWN is normal pacing) | GREEN | 2026-10-13T06:25:04.709Z |
| pulse.fresh | age=3m conclusion=status=in_progress run=38356542027 | age<=2400s (40m) and conclusion=success | GREEN | 2026-10-13T06:24:45Z |
| potential.fresh | age=3.8h path=office-pages:potential.json | age<=93600s (26h) | GREEN | 2026-10-13T02:37:48Z |
| fleetdigest.fresh | age=3.8h path=office-pages:digest.json | age<=93600s (26h) | GREEN | 2026-10-13T02:37:48Z |
| office.schedule | age=3.8h conclusion=success | newest schedule run age<=93600s (26h) | GREEN | 2026-10-13T02:37:28Z |
| billing.block | no billing-block annotation (0 failed run(s) of 0 in last 15) | no 'payments have failed'/'spending limit' annotations on recent failed runs | GREEN | unavailable |

Legend:
- RED: the measured value crossed its threshold; RED rows are mirrored in the open GRID-ALERT issue.
- GREEN: within threshold. UNAVAILABLE: the signal could not be measured and is treated as RED until proven otherwise.
- Auto-managed by grid-watchdog; machine state in state/grid-status.json. Telemetry only — no keys, no account identifiers.
