# Grid status

Generated 2026-10-12T21:10:45Z by grid-watchdog (schedule 13,43 * * * * UTC). Cross-repo visibility: yes.

| Signal | Measured | Threshold | Status | Since |
|---|---|---|---|---|
| heartbeat.fresh | age=48m http=200 | age<=2400s (40m); missing/unparseable is red | RED | 2026-10-12T20:22:17.390Z |
| custody.coverage | verified=1/total=14 | verified>=14 | RED | 2026-10-12T20:22:17.390Z |
| social.verdict | verdict=PART-GATED executed=0 refused=13 | verdict in green set (anything else red) | RED | 2026-10-12T20:22:17.390Z |
| content.verdict | verdict=BRIDGE-DOWN draftsQueued=0 | verdict in green set (anything else red) | RED | 2026-10-12T20:22:17.390Z |
| dex.anchor | verdict=STANDBY anchorAgeMs=2024225 | anchorAgeMs<=86400000 (24h) | GREEN | 2026-10-12T20:22:17.390Z |
| blurt.live | verdict=BLURT-RPC-UNREACHABLE live=0/12 | live>=1 | RED | 2026-10-12T20:22:17.390Z |
| delegation.verdict | verdict=CUSTODY-GATE-REFUSED ops=0 | verdict in green set (anything else red) | RED | 2026-10-12T20:22:17.390Z |
| digest.verdict | verdict=COOLDOWN slot=2 | verdict in green set (COOLDOWN is normal pacing) | GREEN | 2026-10-12T20:22:17.390Z |
| pulse.fresh | age=31m conclusion=status=in_progress run=38305685622 | age<=2400s (40m) and conclusion=success | GREEN | 2026-10-12T20:39:56Z |
| potential.fresh | age=5.6h path=office-pages:potential.json | age<=93600s (26h) | GREEN | 2026-10-12T15:36:34Z |
| fleetdigest.fresh | age=58m path=office-pages:digest.json | age<=93600s (26h) | GREEN | 2026-10-12T20:12:12Z |
| office.schedule | age=5.7h conclusion=success | newest schedule run age<=93600s (26h) | GREEN | 2026-10-12T15:25:59Z |
| billing.block | no billing-block annotation (2 failed run(s) of 9 in last 15) | no 'payments have failed'/'spending limit' annotations on recent failed runs | GREEN | unavailable |

Legend:
- RED: the measured value crossed its threshold; RED rows are mirrored in the open GRID-ALERT issue.
- GREEN: within threshold. UNAVAILABLE: the signal could not be measured and is treated as RED until proven otherwise.
- Auto-managed by grid-watchdog; machine state in state/grid-status.json. Telemetry only — no keys, no account identifiers.
