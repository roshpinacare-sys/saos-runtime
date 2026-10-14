# Grid status

Generated 2026-10-14T22:04:12Z by grid-watchdog (schedule 13,43 * * * * UTC). Cross-repo visibility: yes.

| Signal | Measured | Threshold | Status | Since |
|---|---|---|---|---|
| heartbeat.fresh | src=saos-runtime@main:state/beat/ci-last-heartbeat.json age=3.6h http=200 | age<=2400s (40m); missing/unparseable is red | RED | 2026-10-14T18:28:00.304Z |
| anchor.probe | verdict=OK age=4.0h src=steem@saos-cockpit:state/anchor-probe.json | verdict=OK and age<=24h (probe verdict recorded by the beat, mirrored here) | GREEN | 2026-10-14T18:04:54Z |
| custody.coverage | verified=14/total=14 | verified>=14 | GREEN | 2026-10-14T18:28:00.304Z |
| social.verdict | verdict=SOCIAL-STANDBY executed=None refused=None | verdict in green set (WAIT = designed gate state) | WAIT (designed) | 2026-10-14T18:28:00.304Z |
| content.verdict | verdict=QUEUED draftsQueued=None | verdict in green set (anything else red) | GREEN | 2026-10-14T18:28:00.304Z |
| dex.anchor | verdict=TAKEOVER-EXECUTED anchorAgeMs=unavailable | anchorAgeMs<=86400000 (24h); WAIT = engine-standby is designed | WAIT (designed) | 2026-10-14T18:28:00.304Z |
| blurt.live | verdict=BLURT-BODIES-LIVE live=12/None | live>=1 | GREEN | 2026-10-14T18:28:00.304Z |
| delegation.verdict | verdict=ALREADY-TODAY ops=None | verdict in green set (WAIT = custody gate refusal is the brake working) | RED | 2026-10-14T18:28:00.304Z |
| digest.verdict | verdict=COOLDOWN slot=None | verdict in green set (COOLDOWN is normal pacing) | GREEN | 2026-10-14T18:28:00.304Z |
| pulse.fresh | age=38s conclusion=status=in_progress run=38644911599 | age<=2400s (40m) and conclusion=success | GREEN | 2026-10-14T22:03:26Z |
| potential.fresh | age=3.6h path=office-pages:potential.json | age<=93600s (26h) | GREEN | 2026-10-14T18:29:59Z |
| fleetdigest.fresh | age=3.6h path=office-pages:digest.json | age<=93600s (26h) | GREEN | 2026-10-14T18:29:59Z |
| office.schedule | age=3.6h conclusion=success | newest schedule run age<=93600s (26h) | GREEN | 2026-10-14T18:29:37Z |
| billing.block | no billing-block annotation (2 failed run(s) of 7 in last 15) | no 'payments have failed'/'spending limit' annotations on recent failed runs | GREEN | unavailable |

Legend:
- RED: the measured value crossed its threshold; RED rows are mirrored in the open GRID-ALERT issue.
- GREEN: within threshold. WAIT (designed): a designed gate/standby state — visible, not alarmed, not silenced.
- UNAVAILABLE: the signal could not be measured and is treated as RED until proven otherwise.
- Auto-managed by grid-watchdog; machine state in state/grid-status.json. Telemetry only — no keys, no account identifiers.
