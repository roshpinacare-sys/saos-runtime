# Grid status

Generated 2026-10-13T00:35:32Z by grid-watchdog (schedule 13,43 * * * * UTC). Cross-repo visibility: yes.

| Signal | Measured | Threshold | Status | Since |
|---|---|---|---|---|
| heartbeat.fresh | age=3m http=200 | age<=2400s (40m); missing/unparseable is red | GREEN | 2026-10-13T00:32:26.032Z |
| custody.coverage | verified=1/total=14 | verified>=14 | RED | 2026-10-13T00:32:26.032Z |
| social.verdict | verdict=PART-GATED executed=None refused=None | verdict in green set (anything else red) | RED | 2026-10-13T00:32:26.032Z |
| content.verdict | verdict=BRIDGE-DOWN draftsQueued=None | verdict in green set (anything else red) | RED | 2026-10-13T00:32:26.032Z |
| dex.anchor | verdict=STANDBY anchorAgeMs=unavailable | anchorAgeMs<=86400000 (24h) | UNAVAILABLE | 2026-10-13T00:32:26.032Z |
| blurt.live | verdict=BLURT-BODIES-LIVE live=None/None | live>=1 | RED | 2026-10-13T00:32:26.032Z |
| delegation.verdict | verdict=CUSTODY-GATE-REFUSED ops=None | verdict in green set (anything else red) | RED | 2026-10-13T00:32:26.032Z |
| digest.verdict | verdict=DIGEST-READY slot=None | verdict in green set (COOLDOWN is normal pacing) | RED | 2026-10-13T00:32:26.032Z |
| pulse.fresh | age=3m conclusion=status=in_progress run=38327709215 | age<=2400s (40m) and conclusion=success | GREEN | 2026-10-13T00:31:59Z |
| potential.fresh | age=9.0h path=office-pages:potential.json | age<=93600s (26h) | GREEN | 2026-10-12T15:36:34Z |
| fleetdigest.fresh | age=4.4h path=office-pages:digest.json | age<=93600s (26h) | GREEN | 2026-10-12T20:12:12Z |
| office.schedule | age=9.2h conclusion=success | newest schedule run age<=93600s (26h) | GREEN | 2026-10-12T15:25:59Z |
| billing.block | no billing-block annotation (2 failed run(s) of 4 in last 15) | no 'payments have failed'/'spending limit' annotations on recent failed runs | GREEN | unavailable |

Legend:
- RED: the measured value crossed its threshold; RED rows are mirrored in the open GRID-ALERT issue.
- GREEN: within threshold. UNAVAILABLE: the signal could not be measured and is treated as RED until proven otherwise.
- Auto-managed by grid-watchdog; machine state in state/grid-status.json. Telemetry only — no keys, no account identifiers.
