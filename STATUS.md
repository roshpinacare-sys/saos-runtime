# Grid status

Generated 2026-10-24T01:53:47Z by grid-watchdog (schedule 13,43 * * * * UTC). Cross-repo visibility: yes.

| Signal | Measured | Threshold | Status | Since |
|---|---|---|---|---|
| heartbeat.fresh | src=saos-runtime@main:state/beat/ci-last-heartbeat.json age=2m http=200 | red if missing/unparseable OR age>5400s (90m fail-loud) OR age>2400s (40m) with no runtime run in-flight | GREEN | 2026-10-24T01:51:53.458Z |
| anchor.probe | verdict=OK age=85m src=steem@saos-cockpit:state/anchor-probe.json | verdict=OK and age<=24h (probe verdict recorded by the beat, mirrored here) | GREEN | 2026-10-24T00:28:18Z |
| custody.coverage | verified=14/total=14 | verified>=14 | GREEN | 2026-10-24T01:51:53.458Z |
| social.verdict | verdict=SOCIAL-IDLE executed=0 refused=0 | verdict in green set (WAIT = designed gate state) | GREEN | 2026-10-24T01:51:53.458Z |
| content.verdict | verdict=QUEUED draftsQueued=None | verdict in green set (anything else red) | GREEN | 2026-10-24T01:51:53.458Z |
| dex.anchor | verdict=STANDBY anchorAgeMs=unavailable | anchorAgeMs<=86400000 (24h); WAIT = engine-standby is designed | WAIT (designed) | 2026-10-24T01:51:53.458Z |
| blurt.live | verdict=BLURT-BODIES-LIVE live=12/None | live>=1 measured · BLURT-RPC-UNREACHABLE = third-party infra outage (loud in measured, not machine-fault) | GREEN | 2026-10-24T01:51:53.458Z |
| delegation.verdict | verdict=ALREADY-TODAY ops=0 | verdict in green set (WAIT = custody gate refusal is the brake working) | GREEN | 2026-10-24T01:51:53.458Z |
| digest.verdict | verdict=DIGEST-READY slot=None | verdict in green set (COOLDOWN is normal pacing) | GREEN | 2026-10-24T01:51:53.458Z |
| pulse.fresh | age=3m conclusion=status=in_progress run=40051626946 | red if failed OR age>5400s (90m fail-loud) OR age>2400s (40m) not in-flight | GREEN | 2026-10-24T01:50:51Z |
| potential.fresh | age=1.9h path=office-pages:potential.json | age<=93600s (26h) | GREEN | 2026-10-23T23:58:32Z |
| fleetdigest.fresh | age=1.9h path=office-pages:digest.json | age<=93600s (26h) | GREEN | 2026-10-23T23:58:32Z |
| office.schedule | age=2.0h conclusion=success | newest schedule run age<=93600s (26h) | GREEN | 2026-10-23T23:55:39Z |
| billing.block | no billing-block annotation (1 failed run(s) of 1 in last 15) | no 'payments have failed'/'spending limit' annotations on recent failed runs | GREEN | unavailable |

Legend:
- RED: the measured value crossed its threshold; RED rows are mirrored in the open GRID-ALERT issue.
- GREEN: within threshold. WAIT (designed): a designed gate/standby state — visible, not alarmed, not silenced.
- UNAVAILABLE: the signal could not be measured and is treated as RED until proven otherwise.
- Auto-managed by grid-watchdog; machine state in state/grid-status.json. Telemetry only — no keys, no account identifiers.
