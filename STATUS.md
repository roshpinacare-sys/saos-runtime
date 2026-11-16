# Grid status

Generated 2026-11-16T00:15:19Z by grid-watchdog (schedule 13,43 * * * * UTC). Cross-repo visibility: yes.

| Signal | Measured | Threshold | Status | Since |
|---|---|---|---|---|
| heartbeat.fresh | src=saos-runtime@main:state/beat/ci-last-heartbeat.json age=3m http=200 | red if missing/unparseable OR age>5400s (90m fail-loud) OR age>2400s (40m) with no runtime run in-flight | GREEN | 2026-11-16T00:12:09.689Z |
| engine.source | selftest.mjs http=200 src=steem@saos-cockpit:mini-services/saos-engine (engine source present) | engine source readable on the cockpit tree (selftest.mjs); absent = red (wiped 2026-10-24T19:16Z by seal-host 4b1cd2ed8 — restoring the engine tree is the cure) | GREEN | unavailable |
| anchor.probe | verdict=OK age=3m src=steem@saos-cockpit:state/anchor-probe.json | verdict=OK and age<=24h (probe verdict recorded by the beat, mirrored here) | GREEN | 2026-11-16T00:12:09Z |
| custody.coverage | verified=14/total=14 | verified>=14 | GREEN | 2026-11-16T00:12:09.689Z |
| social.verdict | verdict=SOCIAL-IDLE executed=0 refused=0 | verdict in green set (WAIT = designed gate state) | GREEN | 2026-11-16T00:12:09.689Z |
| content.verdict | verdict=BRIDGE-DOWN draftsQueued=None | verdict in green set (anything else red) | RED | 2026-11-16T00:12:09.689Z |
| dex.anchor | verdict=STANDBY anchorAgeMs=unavailable | anchorAgeMs<=86400000 (24h); WAIT = engine-standby is designed | WAIT (designed) | 2026-11-16T00:12:09.689Z |
| blurt.live | verdict=BLURT-BODIES-LIVE live=12/None | live>=1 measured · BLURT-RPC-UNREACHABLE = third-party infra outage (loud in measured, not machine-fault) | GREEN | 2026-11-16T00:12:09.689Z |
| delegation.verdict | verdict=ALREADY-TODAY ops=0 | verdict in green set (WAIT = custody gate refusal is the brake working) | GREEN | 2026-11-16T00:12:09.689Z |
| digest.verdict | verdict=DIGEST-READY slot=None | verdict in green set (COOLDOWN is normal pacing) | GREEN | 2026-11-16T00:12:09.689Z |
| pulse.fresh | age=3m conclusion=status=in_progress run=43778917758 | red if failed OR age>5400s (90m fail-loud) OR age>2400s (40m) not in-flight | GREEN | 2026-11-16T00:11:44Z |
| potential.fresh | age=4.7h path=office-pages:potential.json | age<=93600s (26h) | GREEN | 2026-11-15T19:32:36Z |
| fleetdigest.fresh | age=4.7h path=office-pages:digest.json | age<=93600s (26h) | GREEN | 2026-11-15T19:32:36Z |
| office.schedule | age=4.7h conclusion=success | newest schedule run age<=93600s (26h) | GREEN | 2026-11-15T19:31:44Z |
| billing.block | no billing-block annotation (2 failed run(s) of 3 in last 15) | no 'payments have failed'/'spending limit' annotations on recent failed runs | GREEN | unavailable |

Legend:
- RED: the measured value crossed its threshold; RED rows are mirrored in the open GRID-ALERT issue.
- GREEN: within threshold. WAIT (designed): a designed gate/standby state — visible, not alarmed, not silenced.
- WOUNDED (carried): the lane is unmeasured because the engine is wounded; the wound itself is RED under engine.source — visible, not alarmed twice, not silenced.
- UNAVAILABLE: the signal could not be measured and is treated as RED until proven otherwise.
- Auto-managed by grid-watchdog; machine state in state/grid-status.json. Telemetry only — no keys, no account identifiers.
