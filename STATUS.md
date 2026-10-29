# Grid status

Generated 2026-10-29T00:57:16Z by grid-watchdog (schedule 13,43 * * * * UTC). Cross-repo visibility: yes.

| Signal | Measured | Threshold | Status | Since |
|---|---|---|---|---|
| heartbeat.fresh | src=saos-runtime@main:state/beat/ci-last-heartbeat.json age=38s http=200 | red if missing/unparseable OR age>5400s (90m fail-loud) OR age>2400s (40m) with no runtime run in-flight | GREEN | 2026-10-29T00:56:31.938Z |
| engine.source | selftest.mjs http=200 src=steem@saos-cockpit:mini-services/saos-engine (engine source present) | engine source readable on the cockpit tree (selftest.mjs); absent = red (wiped 2026-10-24T19:16Z by seal-host 4b1cd2ed8 — restoring the engine tree is the cure) | GREEN | unavailable |
| anchor.probe | verdict=PROBE-SCRIPT-ABSENT age=36m src=steem@saos-cockpit:state/anchor-probe.json | verdict=OK and age<=24h (probe verdict recorded by the beat, mirrored here) | RED | 2026-10-29T00:21:01Z |
| custody.coverage | verified=0/total=14 | verified>=14 | RED | 2026-10-29T00:56:31.938Z |
| social.verdict | verdict=PART-GATED executed=0 refused=13 | verdict in green set (WAIT = designed gate state) | WAIT (designed) | 2026-10-29T00:56:31.938Z |
| content.verdict | verdict=QUEUED draftsQueued=None | verdict in green set (anything else red) | GREEN | 2026-10-29T00:56:31.938Z |
| dex.anchor | verdict=STANDBY anchorAgeMs=unavailable | anchorAgeMs<=86400000 (24h); WAIT = engine-standby is designed | WAIT (designed) | 2026-10-29T00:56:31.938Z |
| blurt.live | verdict=BLURT-BODIES-LIVE live=12/None | live>=1 measured · BLURT-RPC-UNREACHABLE = third-party infra outage (loud in measured, not machine-fault) | GREEN | 2026-10-29T00:56:31.938Z |
| delegation.verdict | verdict=CUSTODY-GATE-REFUSED ops=0 | verdict in green set (WAIT = custody gate refusal is the brake working) | WAIT (designed) | 2026-10-29T00:56:31.938Z |
| digest.verdict | verdict=COOLDOWN slot=None | verdict in green set (COOLDOWN is normal pacing) | GREEN | 2026-10-29T00:56:31.938Z |
| pulse.fresh | age=64s conclusion=status=in_progress run=40797254759 | red if failed OR age>5400s (90m fail-loud) OR age>2400s (40m) not in-flight | GREEN | 2026-10-29T00:56:07Z |
| potential.fresh | age=5.6h path=office-pages:potential.json | age<=93600s (26h) | GREEN | 2026-10-28T19:20:40Z |
| fleetdigest.fresh | age=5.6h path=office-pages:digest.json | age<=93600s (26h) | GREEN | 2026-10-28T19:20:40Z |
| office.schedule | age=5.7h conclusion=success | newest schedule run age<=93600s (26h) | GREEN | 2026-10-28T19:17:47Z |
| billing.block | no billing-block annotation (1 failed run(s) of 1 in last 15) | no 'payments have failed'/'spending limit' annotations on recent failed runs | GREEN | unavailable |

Legend:
- RED: the measured value crossed its threshold; RED rows are mirrored in the open GRID-ALERT issue.
- GREEN: within threshold. WAIT (designed): a designed gate/standby state — visible, not alarmed, not silenced.
- WOUNDED (carried): the lane is unmeasured because the engine is wounded; the wound itself is RED under engine.source — visible, not alarmed twice, not silenced.
- UNAVAILABLE: the signal could not be measured and is treated as RED until proven otherwise.
- Auto-managed by grid-watchdog; machine state in state/grid-status.json. Telemetry only — no keys, no account identifiers.
