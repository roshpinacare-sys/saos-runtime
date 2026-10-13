# Grid status

Generated 2026-10-13T09:21:19Z by grid-watchdog (schedule 13,43 * * * * UTC). Cross-repo visibility: yes.

| Signal | Measured | Threshold | Status | Since |
|---|---|---|---|---|
| heartbeat.fresh | age=10m http=200 | age<=2400s (40m); missing/unparseable is red | GREEN | 2026-10-13T09:10:56.382Z |
| custody.coverage | verified=1/total=14 | verified>=14 | RED | 2026-10-13T09:10:56.382Z |
| social.verdict | verdict=PART-GATED executed=None refused=None | verdict in green set (anything else red) | RED | 2026-10-13T09:10:56.382Z |
| content.verdict | verdict=BRIDGE-DOWN draftsQueued=None | verdict in green set (anything else red) | RED | 2026-10-13T09:10:56.382Z |
| dex.anchor | verdict=TAKEOVER-EXECUTED anchorAgeMs=unavailable | anchorAgeMs<=86400000 (24h) | UNAVAILABLE | 2026-10-13T09:10:56.382Z |
| blurt.live | verdict=BLURT-BODIES-LIVE live=None/None | live>=1 | RED | 2026-10-13T09:10:56.382Z |
| delegation.verdict | verdict=CUSTODY-GATE-REFUSED ops=None | verdict in green set (anything else red) | RED | 2026-10-13T09:10:56.382Z |
| digest.verdict | verdict=COOLDOWN slot=None | verdict in green set (COOLDOWN is normal pacing) | GREEN | 2026-10-13T09:10:56.382Z |
| pulse.fresh | age=11m conclusion=status=in_progress run=38374412102 | age<=2400s (40m) and conclusion=success | GREEN | 2026-10-13T09:10:26Z |
| potential.fresh | age=6.7h path=office-pages:potential.json | age<=93600s (26h) | GREEN | 2026-10-13T02:37:48Z |
| fleetdigest.fresh | age=6.7h path=office-pages:digest.json | age<=93600s (26h) | GREEN | 2026-10-13T02:37:48Z |
| office.schedule | age=6.7h conclusion=success | newest schedule run age<=93600s (26h) | GREEN | 2026-10-13T02:37:28Z |
| billing.block | no billing-block annotation (0 failed run(s) of 0 in last 15) | no 'payments have failed'/'spending limit' annotations on recent failed runs | GREEN | unavailable |

Legend:
- RED: the measured value crossed its threshold; RED rows are mirrored in the open GRID-ALERT issue.
- GREEN: within threshold. UNAVAILABLE: the signal could not be measured and is treated as RED until proven otherwise.
- Auto-managed by grid-watchdog; machine state in state/grid-status.json. Telemetry only — no keys, no account identifiers.
