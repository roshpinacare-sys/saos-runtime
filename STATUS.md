# Grid status

Generated 2026-10-19T17:53:43Z by grid-watchdog (schedule 13,43 * * * * UTC). Cross-repo visibility: yes.

| Signal | Measured | Threshold | Status | Since |
|---|---|---|---|---|
| heartbeat.fresh | src=saos-runtime@main:state/beat/ci-last-heartbeat.json age=24m http=200 | red if missing/unparseable OR age>5400s (90m fail-loud) OR age>2400s (40m) with no runtime run in-flight | GREEN | 2026-10-19T17:29:35.091Z |
| anchor.probe | verdict=OK age=50m src=steem@saos-cockpit:state/anchor-probe.json | verdict=OK and age<=24h (probe verdict recorded by the beat, mirrored here) | GREEN | 2026-10-19T17:03:27Z |
| custody.coverage | verified=14/total=14 | verified>=14 | GREEN | 2026-10-19T17:29:35.091Z |
| social.verdict | verdict=SOCIAL-STANDBY executed=None refused=None | verdict in green set (WAIT = designed gate state) | WAIT (designed) | 2026-10-19T17:29:35.091Z |
| content.verdict | verdict=QUEUED draftsQueued=None | verdict in green set (anything else red) | GREEN | 2026-10-19T17:29:35.091Z |
| dex.anchor | verdict=STANDBY anchorAgeMs=unavailable | anchorAgeMs<=86400000 (24h); WAIT = engine-standby is designed | WAIT (designed) | 2026-10-19T17:29:35.091Z |
| blurt.live | verdict=BLURT-RPC-UNREACHABLE live=0/None | live>=1 | RED | 2026-10-19T17:29:35.091Z |
| delegation.verdict | verdict=ALREADY-TODAY ops=0 | verdict in green set (WAIT = custody gate refusal is the brake working) | GREEN | 2026-10-19T17:29:35.091Z |
| digest.verdict | verdict=COOLDOWN slot=None | verdict in green set (COOLDOWN is normal pacing) | GREEN | 2026-10-19T17:29:35.091Z |
| pulse.fresh | age=25m conclusion=status=in_progress run=39294511545 | red if failed OR age>5400s (90m fail-loud) OR age>2400s (40m) not in-flight | GREEN | 2026-10-19T17:29:07Z |
| potential.fresh | age=75m path=office-pages:potential.json | age<=93600s (26h) | GREEN | 2026-10-19T16:38:22Z |
| fleetdigest.fresh | age=67s path=office-pages:digest.json | age<=93600s (26h) | GREEN | 2026-10-19T17:52:33Z |
| office.schedule | age=76m conclusion=success | newest schedule run age<=93600s (26h) | GREEN | 2026-10-19T16:37:53Z |
| billing.block | no billing-block annotation (0 failed run(s) of 0 in last 15) | no 'payments have failed'/'spending limit' annotations on recent failed runs | GREEN | unavailable |

Legend:
- RED: the measured value crossed its threshold; RED rows are mirrored in the open GRID-ALERT issue.
- GREEN: within threshold. WAIT (designed): a designed gate/standby state — visible, not alarmed, not silenced.
- UNAVAILABLE: the signal could not be measured and is treated as RED until proven otherwise.
- Auto-managed by grid-watchdog; machine state in state/grid-status.json. Telemetry only — no keys, no account identifiers.
