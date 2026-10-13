# Grid status

Generated 2026-10-13T01:12:24Z by grid-watchdog (schedule 13,43 * * * * UTC). Cross-repo visibility: yes.

| Signal | Measured | Threshold | Status | Since |
|---|---|---|---|---|
| heartbeat.fresh | age=3m http=200 | age<=2400s (40m); missing/unparseable is red | GREEN | 2026-10-13T01:09:03.130Z |
| custody.coverage | verified=1/total=14 | verified>=14 | RED | 2026-10-13T01:09:03.130Z |
| social.verdict | verdict=PART-GATED executed=None refused=None | verdict in green set (anything else red) | RED | 2026-10-13T01:09:03.130Z |
| content.verdict | verdict=BRIDGE-DOWN draftsQueued=None | verdict in green set (anything else red) | RED | 2026-10-13T01:09:03.130Z |
| dex.anchor | verdict=STANDBY anchorAgeMs=unavailable | anchorAgeMs<=86400000 (24h) | UNAVAILABLE | 2026-10-13T01:09:03.130Z |
| blurt.live | verdict=BLURT-BODIES-LIVE live=None/None | live>=1 | RED | 2026-10-13T01:09:03.130Z |
| delegation.verdict | verdict=CUSTODY-GATE-REFUSED ops=None | verdict in green set (anything else red) | RED | 2026-10-13T01:09:03.130Z |
| digest.verdict | verdict=COOLDOWN slot=None | verdict in green set (COOLDOWN is normal pacing) | GREEN | 2026-10-13T01:09:03.130Z |
| pulse.fresh | age=4m conclusion=status=in_progress run=38330708007 | age<=2400s (40m) and conclusion=success | GREEN | 2026-10-13T01:08:38Z |
| potential.fresh | age=9.6h path=office-pages:potential.json | age<=93600s (26h) | GREEN | 2026-10-12T15:36:34Z |
| fleetdigest.fresh | age=23m path=office-pages:digest.json | age<=93600s (26h) | GREEN | 2026-10-13T00:49:04Z |
| office.schedule | age=9.8h conclusion=success | newest schedule run age<=93600s (26h) | GREEN | 2026-10-12T15:25:59Z |
| billing.block | no billing-block annotation (2 failed run(s) of 3 in last 15) | no 'payments have failed'/'spending limit' annotations on recent failed runs | GREEN | unavailable |

Legend:
- RED: the measured value crossed its threshold; RED rows are mirrored in the open GRID-ALERT issue.
- GREEN: within threshold. UNAVAILABLE: the signal could not be measured and is treated as RED until proven otherwise.
- Auto-managed by grid-watchdog; machine state in state/grid-status.json. Telemetry only — no keys, no account identifiers.
