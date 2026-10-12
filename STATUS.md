# Grid status

Generated 2026-10-12T23:58:43Z by grid-watchdog (schedule 13,43 * * * * UTC). Cross-repo visibility: yes.

| Signal | Measured | Threshold | Status | Since |
|---|---|---|---|---|
| heartbeat.fresh | age=17m http=200 | age<=2400s (40m); missing/unparseable is red | GREEN | 2026-10-12T23:41:07.109Z |
| custody.coverage | verified=14/total=14 | verified>=14 | GREEN | 2026-10-12T23:41:07.109Z |
| social.verdict | verdict=SOCIAL-EXECUTED executed=None refused=None | verdict in green set (anything else red) | RED | 2026-10-12T23:41:07.109Z |
| content.verdict | verdict=BRIDGE-DOWN draftsQueued=None | verdict in green set (anything else red) | RED | 2026-10-12T23:41:07.109Z |
| dex.anchor | verdict=STANDBY anchorAgeMs=unavailable | anchorAgeMs<=86400000 (24h) | UNAVAILABLE | 2026-10-12T23:41:07.109Z |
| blurt.live | verdict=BLURT-BODIES-LIVE live=None/None | live>=1 | RED | 2026-10-12T23:41:07.109Z |
| delegation.verdict | verdict=BROADCAST-FAILED ops=None | verdict in green set (anything else red) | RED | 2026-10-12T23:41:07.109Z |
| digest.verdict | verdict=COOLDOWN slot=None | verdict in green set (COOLDOWN is normal pacing) | GREEN | 2026-10-12T23:41:07.109Z |
| pulse.fresh | age=18m conclusion=status=in_progress run=38323391929 | age<=2400s (40m) and conclusion=success | GREEN | 2026-10-12T23:40:46Z |
| potential.fresh | age=8.4h path=office-pages:potential.json | age<=93600s (26h) | GREEN | 2026-10-12T15:36:34Z |
| fleetdigest.fresh | age=3.8h path=office-pages:digest.json | age<=93600s (26h) | GREEN | 2026-10-12T20:12:12Z |
| office.schedule | age=8.5h conclusion=success | newest schedule run age<=93600s (26h) | GREEN | 2026-10-12T15:25:59Z |
| billing.block | no billing-block annotation (2 failed run(s) of 6 in last 15) | no 'payments have failed'/'spending limit' annotations on recent failed runs | GREEN | unavailable |

Legend:
- RED: the measured value crossed its threshold; RED rows are mirrored in the open GRID-ALERT issue.
- GREEN: within threshold. UNAVAILABLE: the signal could not be measured and is treated as RED until proven otherwise.
- Auto-managed by grid-watchdog; machine state in state/grid-status.json. Telemetry only — no keys, no account identifiers.
