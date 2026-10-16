# Grid status

Generated 2026-10-16T22:19:42Z by grid-watchdog (schedule 13,43 * * * * UTC). Cross-repo visibility: yes.

| Signal | Measured | Threshold | Status | Since |
|---|---|---|---|---|
| heartbeat.fresh | src=saos-runtime@main:state/beat/ci-last-heartbeat.json age=22m http=200 | age<=2400s (40m); missing/unparseable is red | GREEN | 2026-10-16T21:57:31.888Z |
| anchor.probe | verdict=OK age=7.9h src=steem@saos-cockpit:state/anchor-probe.json | verdict=OK and age<=24h (probe verdict recorded by the beat, mirrored here) | GREEN | 2026-10-16T14:28:27Z |
| custody.coverage | verified=14/total=14 | verified>=14 | GREEN | 2026-10-16T21:57:31.888Z |
| social.verdict | verdict=SOCIAL-STANDBY executed=None refused=None | verdict in green set (WAIT = designed gate state) | WAIT (designed) | 2026-10-16T21:57:31.888Z |
| content.verdict | verdict=QUEUED draftsQueued=None | verdict in green set (anything else red) | GREEN | 2026-10-16T21:57:31.888Z |
| dex.anchor | verdict=TAKEOVER-EXECUTED anchorAgeMs=unavailable | anchorAgeMs<=86400000 (24h); WAIT = engine-standby is designed | WAIT (designed) | 2026-10-16T21:57:31.888Z |
| blurt.live | verdict=BLURT-BODIES-LIVE live=12/None | live>=1 | GREEN | 2026-10-16T21:57:31.888Z |
| delegation.verdict | verdict=ALREADY-TODAY ops=None | verdict in green set (WAIT = custody gate refusal is the brake working) | RED | 2026-10-16T21:57:31.888Z |
| digest.verdict | verdict=COOLDOWN slot=None | verdict in green set (COOLDOWN is normal pacing) | GREEN | 2026-10-16T21:57:31.888Z |
| pulse.fresh | age=23m conclusion=status=in_progress run=38972699785 | age<=2400s (40m) and conclusion=success | GREEN | 2026-10-16T21:56:50Z |
| potential.fresh | age=19m path=office-pages:potential.json | age<=93600s (26h) | GREEN | 2026-10-16T22:00:44Z |
| fleetdigest.fresh | age=7.3h path=main:t19b/mirror/Domain/office3d/digest.json | age<=93600s (26h) | GREEN | 2026-10-16T14:58:40Z |
| office.schedule | age=22.6h conclusion=success | newest schedule run age<=93600s (26h) | GREEN | 2026-10-15T23:43:10Z |
| billing.block | no billing-block annotation (2 failed run(s) of 6 in last 15) | no 'payments have failed'/'spending limit' annotations on recent failed runs | GREEN | unavailable |

Legend:
- RED: the measured value crossed its threshold; RED rows are mirrored in the open GRID-ALERT issue.
- GREEN: within threshold. WAIT (designed): a designed gate/standby state — visible, not alarmed, not silenced.
- UNAVAILABLE: the signal could not be measured and is treated as RED until proven otherwise.
- Auto-managed by grid-watchdog; machine state in state/grid-status.json. Telemetry only — no keys, no account identifiers.
