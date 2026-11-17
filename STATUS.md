# Grid status

Generated 2026-11-17T03:25:41Z by grid-watchdog (schedule 13,43 * * * * UTC). Cross-repo visibility: yes.

| Signal | Measured | Threshold | Status | Since |
|---|---|---|---|---|
| heartbeat.fresh | src=saos-runtime@main:state/beat/ci-last-heartbeat.json age=4m http=200 | red if missing/unparseable OR age>5400s (90m fail-loud) OR age>2400s (40m) with no runtime run in-flight | GREEN | 2026-11-17T03:21:56.726Z |
| engine.source | selftest.mjs http=200 src=steem@saos-cockpit:mini-services/saos-engine (engine source present) | engine source readable on the cockpit tree (selftest.mjs); absent = red (wiped 2026-10-24T19:16Z by seal-host 4b1cd2ed8 — restoring the engine tree is the cure) | GREEN | unavailable |
| anchor.probe | verdict=OK age=4m src=steem@saos-cockpit:state/anchor-probe.json | verdict=OK and age<=24h (probe verdict recorded by the beat, mirrored here) | GREEN | 2026-11-17T03:21:56Z |
| custody.coverage | verified=14/total=14 | verified>=14 | GREEN | 2026-11-17T03:21:56.726Z |
| social.verdict | verdict=SOCIAL-IDLE executed=0 refused=0 | verdict in green set (WAIT = designed gate state) | GREEN | 2026-11-17T03:21:56.726Z |
| content.verdict | verdict=BRIDGE-DOWN draftsQueued=None | verdict in green set (anything else red) | RED | 2026-11-17T03:21:56.726Z |
| dex.anchor | verdict=STANDBY anchorAgeMs=unavailable | anchorAgeMs<=86400000 (24h); WAIT = engine-standby is designed | WAIT (designed) | 2026-11-17T03:21:56.726Z |
| blurt.live | verdict=BLURT-BODIES-LIVE live=12/None | live>=1 measured · BLURT-RPC-UNREACHABLE = third-party infra outage (loud in measured, not machine-fault) | GREEN | 2026-11-17T03:21:56.726Z |
| delegation.verdict | verdict=ALREADY-TODAY ops=0 | verdict in green set (WAIT = custody gate refusal is the brake working) | GREEN | 2026-11-17T03:21:56.726Z |
| digest.verdict | verdict=COOLDOWN slot=None | verdict in green set (COOLDOWN is normal pacing) | GREEN | 2026-11-17T03:21:56.726Z |
| pulse.fresh | age=4m conclusion=status=in_progress run=44009631945 | red if failed OR age>5400s (90m fail-loud) OR age>2400s (40m) not in-flight | GREEN | 2026-11-17T03:21:33Z |
| potential.fresh | age=4.2h path=office-pages:potential.json | age<=93600s (26h) | GREEN | 2026-11-16T23:10:58Z |
| fleetdigest.fresh | age=4.2h path=office-pages:digest.json | age<=93600s (26h) | GREEN | 2026-11-16T23:10:58Z |
| office.schedule | age=4.3h conclusion=success | newest schedule run age<=93600s (26h) | GREEN | 2026-11-16T23:10:18Z |
| billing.block | no billing-block annotation (0 failed run(s) of 0 in last 15) | no 'payments have failed'/'spending limit' annotations on recent failed runs | GREEN | unavailable |

Legend:
- RED: the measured value crossed its threshold; RED rows are mirrored in the open GRID-ALERT issue.
- GREEN: within threshold. WAIT (designed): a designed gate/standby state — visible, not alarmed, not silenced.
- WOUNDED (carried): the lane is unmeasured because the engine is wounded; the wound itself is RED under engine.source — visible, not alarmed twice, not silenced.
- UNAVAILABLE: the signal could not be measured and is treated as RED until proven otherwise.
- Auto-managed by grid-watchdog; machine state in state/grid-status.json. Telemetry only — no keys, no account identifiers.
