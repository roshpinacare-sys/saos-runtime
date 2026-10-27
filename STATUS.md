# Grid status

Generated 2026-10-27T13:17:34Z by grid-watchdog (schedule 13,43 * * * * UTC). Cross-repo visibility: yes.

| Signal | Measured | Threshold | Status | Since |
|---|---|---|---|---|
| heartbeat.fresh | src=saos-runtime@main:state/beat/ci-last-heartbeat.json age=21m http=200 | red if missing/unparseable OR age>5400s (90m fail-loud) OR age>2400s (40m) with no runtime run in-flight | GREEN | 2026-10-27T12:56:21.156Z |
| engine.source | selftest.mjs http=200 src=steem@saos-cockpit:mini-services/saos-engine (engine source present) | engine source readable on the cockpit tree (selftest.mjs); absent = red (wiped 2026-10-24T19:16Z by seal-host 4b1cd2ed8 — restoring the engine tree is the cure) | GREEN | unavailable |
| anchor.probe | verdict=PROBE-SCRIPT-ABSENT age=59m src=steem@saos-cockpit:state/anchor-probe.json | verdict=OK and age<=24h (probe verdict recorded by the beat, mirrored here) | RED | 2026-10-27T12:18:14Z |
| custody.coverage | verified=3/total=14 | verified>=14 | RED | 2026-10-27T12:56:21.156Z |
| social.verdict | verdict=PART-GATED executed=0 refused=10 | verdict in green set (WAIT = designed gate state) | WAIT (designed) | 2026-10-27T12:56:21.156Z |
| content.verdict | verdict=QUEUED draftsQueued=None | verdict in green set (anything else red) | GREEN | 2026-10-27T12:56:21.156Z |
| dex.anchor | verdict=STANDBY anchorAgeMs=unavailable | anchorAgeMs<=86400000 (24h); WAIT = engine-standby is designed | WAIT (designed) | 2026-10-27T12:56:21.156Z |
| blurt.live | verdict=BLURT-BODIES-LIVE live=12/None | live>=1 measured · BLURT-RPC-UNREACHABLE = third-party infra outage (loud in measured, not machine-fault) | GREEN | 2026-10-27T12:56:21.156Z |
| delegation.verdict | verdict=CUSTODY-GATE-REFUSED ops=0 | verdict in green set (WAIT = custody gate refusal is the brake working) | WAIT (designed) | 2026-10-27T12:56:21.156Z |
| digest.verdict | verdict=COOLDOWN slot=None | verdict in green set (COOLDOWN is normal pacing) | GREEN | 2026-10-27T12:56:21.156Z |
| pulse.fresh | age=22m conclusion=status=in_progress run=40507663528 | red if failed OR age>5400s (90m fail-loud) OR age>2400s (40m) not in-flight | GREEN | 2026-10-27T12:55:40Z |
| potential.fresh | age=66m path=office-pages:potential.json | age<=93600s (26h) | GREEN | 2026-10-27T12:11:16Z |
| fleetdigest.fresh | age=35m path=office-pages:digest.json | age<=93600s (26h) | GREEN | 2026-10-27T12:42:41Z |
| office.schedule | age=67m conclusion=success | newest schedule run age<=93600s (26h) | GREEN | 2026-10-27T12:10:10Z |
| billing.block | no billing-block annotation (0 failed run(s) of 0 in last 15) | no 'payments have failed'/'spending limit' annotations on recent failed runs | GREEN | unavailable |

Legend:
- RED: the measured value crossed its threshold; RED rows are mirrored in the open GRID-ALERT issue.
- GREEN: within threshold. WAIT (designed): a designed gate/standby state — visible, not alarmed, not silenced.
- WOUNDED (carried): the lane is unmeasured because the engine is wounded; the wound itself is RED under engine.source — visible, not alarmed twice, not silenced.
- UNAVAILABLE: the signal could not be measured and is treated as RED until proven otherwise.
- Auto-managed by grid-watchdog; machine state in state/grid-status.json. Telemetry only — no keys, no account identifiers.
