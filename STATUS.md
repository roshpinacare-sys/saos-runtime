# Grid status

Generated 2026-10-13T23:51:14Z by grid-watchdog (schedule 13,43 * * * * UTC). Cross-repo visibility: yes.

| Signal | Measured | Threshold | Status | Since |
|---|---|---|---|---|
| heartbeat.fresh | src=saos-runtime@main:state/beat/ci-last-heartbeat.json age=3m http=200 | age<=2400s (40m); missing/unparseable is red | GREEN | 2026-10-13T23:48:21.852Z |
| anchor.probe | verdict=OK age=3m src=steem@saos-cockpit:state/anchor-probe.json | verdict=OK and age<=24h (probe verdict recorded by the beat, mirrored here) | GREEN | 2026-10-13T23:48:21Z |
| custody.coverage | verified=1/total=14 | verified>=14 | RED | 2026-10-13T23:48:21.852Z |
| social.verdict | verdict=PART-GATED executed=None refused=None | verdict in green set (WAIT = designed gate state) | WAIT (designed) | 2026-10-13T23:48:21.852Z |
| content.verdict | verdict=BRIDGE-DOWN draftsQueued=None | verdict in green set (anything else red) | RED | 2026-10-13T23:48:21.852Z |
| dex.anchor | verdict=STANDBY anchorAgeMs=unavailable | anchorAgeMs<=86400000 (24h); WAIT = engine-standby is designed | WAIT (designed) | 2026-10-13T23:48:21.852Z |
| blurt.live | verdict=BLURT-BODIES-LIVE live=None/None | live>=1 | RED | 2026-10-13T23:48:21.852Z |
| delegation.verdict | verdict=CUSTODY-GATE-REFUSED ops=None | verdict in green set (WAIT = custody gate refusal is the brake working) | WAIT (designed) | 2026-10-13T23:48:21.852Z |
| digest.verdict | verdict=COOLDOWN slot=None | verdict in green set (COOLDOWN is normal pacing) | GREEN | 2026-10-13T23:48:21.852Z |
| pulse.fresh | age=3m conclusion=status=in_progress run=38486401393 | age<=2400s (40m) and conclusion=success | GREEN | 2026-10-13T23:47:54Z |
| potential.fresh | age=3.7h path=office-pages:potential.json | age<=93600s (26h) | GREEN | 2026-10-13T20:11:03Z |
| fleetdigest.fresh | age=3.7h path=office-pages:digest.json | age<=93600s (26h) | GREEN | 2026-10-13T20:11:03Z |
| office.schedule | age=3.7h conclusion=success | newest schedule run age<=93600s (26h) | GREEN | 2026-10-13T20:10:41Z |
| billing.block | no billing-block annotation (2 failed run(s) of 2 in last 15) | no 'payments have failed'/'spending limit' annotations on recent failed runs | GREEN | unavailable |

Legend:
- RED: the measured value crossed its threshold; RED rows are mirrored in the open GRID-ALERT issue.
- GREEN: within threshold. WAIT (designed): a designed gate/standby state — visible, not alarmed, not silenced.
- UNAVAILABLE: the signal could not be measured and is treated as RED until proven otherwise.
- Auto-managed by grid-watchdog; machine state in state/grid-status.json. Telemetry only — no keys, no account identifiers.
