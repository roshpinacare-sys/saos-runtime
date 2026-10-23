# Grid status

Generated 2026-10-23T19:32:57Z by grid-watchdog (schedule 13,43 * * * * UTC). Cross-repo visibility: yes.

| Signal | Measured | Threshold | Status | Since |
|---|---|---|---|---|
| heartbeat.fresh | src=saos-runtime@main:state/beat/ci-last-heartbeat.json age=55m http=200; WATCH in-flight runtime since 2026-10-23T19:04:13Z (grace 40m..90m per fail-loud law) | red if missing/unparseable OR age>5400s (90m fail-loud) OR age>2400s (40m) with no runtime run in-flight | GREEN | 2026-10-23T18:37:46.211Z |
| anchor.probe | verdict=OK age=6.4h src=steem@saos-cockpit:state/anchor-probe.json | verdict=OK and age<=24h (probe verdict recorded by the beat, mirrored here) | GREEN | 2026-10-23T13:07:55Z |
| custody.coverage | verified=14/total=14 | verified>=14 | GREEN | 2026-10-23T18:37:46.211Z |
| social.verdict | verdict=SOCIAL-IDLE executed=0 refused=0 | verdict in green set (WAIT = designed gate state) | GREEN | 2026-10-23T18:37:46.211Z |
| content.verdict | verdict=QUEUED draftsQueued=None | verdict in green set (anything else red) | GREEN | 2026-10-23T18:37:46.211Z |
| dex.anchor | verdict=TAKEOVER-EXECUTED anchorAgeMs=unavailable | anchorAgeMs<=86400000 (24h); WAIT = engine-standby is designed | WAIT (designed) | 2026-10-23T18:37:46.211Z |
| blurt.live | verdict=BLURT-BODIES-LIVE live=12/None | live>=1 measured · BLURT-RPC-UNREACHABLE = third-party infra outage (loud in measured, not machine-fault) | GREEN | 2026-10-23T18:37:46.211Z |
| delegation.verdict | verdict=ALREADY-TODAY ops=0 | verdict in green set (WAIT = custody gate refusal is the brake working) | GREEN | 2026-10-23T18:37:46.211Z |
| digest.verdict | verdict=COOLDOWN slot=None | verdict in green set (COOLDOWN is normal pacing) | GREEN | 2026-10-23T18:37:46.211Z |
| pulse.fresh | age=28m conclusion=status=pending run=40008524358 | red if failed OR age>5400s (90m fail-loud) OR age>2400s (40m) not in-flight | GREEN | 2026-10-23T19:04:40Z |
| potential.fresh | age=88m path=office-pages:potential.json | age<=93600s (26h) | GREEN | 2026-10-23T18:04:57Z |
| fleetdigest.fresh | age=88m path=office-pages:digest.json | age<=93600s (26h) | GREEN | 2026-10-23T18:04:57Z |
| office.schedule | age=89m conclusion=success | newest schedule run age<=93600s (26h) | GREEN | 2026-10-23T18:04:07Z |
| billing.block | no billing-block annotation (0 failed run(s) of 0 in last 15) | no 'payments have failed'/'spending limit' annotations on recent failed runs | GREEN | unavailable |

Legend:
- RED: the measured value crossed its threshold; RED rows are mirrored in the open GRID-ALERT issue.
- GREEN: within threshold. WAIT (designed): a designed gate/standby state — visible, not alarmed, not silenced.
- UNAVAILABLE: the signal could not be measured and is treated as RED until proven otherwise.
- Auto-managed by grid-watchdog; machine state in state/grid-status.json. Telemetry only — no keys, no account identifiers.
