# Grid status

Generated 2026-10-12T20:12:26Z by grid-watchdog (schedule 13,43 * * * * UTC). Cross-repo visibility: yes.

| Signal | Measured | Threshold | Status | Since |
|---|---|---|---|---|
| heartbeat.fresh | age=8m http=200 | age<=2400s (40m); missing/unparseable is red | GREEN | 2026-10-12T20:04:20.533Z |
| custody.coverage | verified=1/total=14 | verified>=14 | RED | 2026-10-12T20:04:20.533Z |
| social.verdict | verdict=PART-GATED executed=0 refused=13 | verdict in green set (anything else red) | RED | 2026-10-12T20:04:20.533Z |
| content.verdict | verdict=DRAFTS-QUEUED draftsQueued=29 | verdict in green set (anything else red) | GREEN | 2026-10-12T20:04:20.533Z |
| dex.anchor | verdict=STANDBY anchorAgeMs=945926 | anchorAgeMs<=86400000 (24h) | GREEN | 2026-10-12T20:04:20.533Z |
| blurt.live | verdict=BLURT-RPC-UNREACHABLE live=0/12 | live>=1 | RED | 2026-10-12T20:04:20.533Z |
| delegation.verdict | verdict=CUSTODY-GATE-REFUSED ops=0 | verdict in green set (anything else red) | RED | 2026-10-12T20:04:20.533Z |
| digest.verdict | verdict=COOLDOWN slot=2 | verdict in green set (COOLDOWN is normal pacing) | GREEN | 2026-10-12T20:04:20.533Z |
| pulse.fresh | age=8m conclusion=status=in_progress run=38301775264 | age<=2400s (40m) and conclusion=success | GREEN | 2026-10-12T20:04:00Z |
| potential.fresh | age=4.6h path=office-pages:potential.json | age<=93600s (26h) | GREEN | 2026-10-12T15:36:34Z |
| fleetdigest.fresh | age=11s path=office-pages:digest.json | age<=93600s (26h) | GREEN | 2026-10-12T20:12:12Z |
| office.schedule | age=4.8h conclusion=success | newest schedule run age<=93600s (26h) | GREEN | 2026-10-12T15:25:59Z |
| billing.block | no billing-block annotation (0 failed run(s) of 0 in last 15) | no 'payments have failed'/'spending limit' annotations on recent failed runs | GREEN | unavailable |

Legend:
- RED: the measured value crossed its threshold; RED rows are mirrored in the open GRID-ALERT issue.
- GREEN: within threshold. UNAVAILABLE: the signal could not be measured and is treated as RED until proven otherwise.
- Auto-managed by grid-watchdog; machine state in state/grid-status.json. Telemetry only — no keys, no account identifiers.
