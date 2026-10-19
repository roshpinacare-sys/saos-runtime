# Grid status

Generated 2026-10-19T15:38:31Z by grid-watchdog (schedule 13,43 * * * * UTC). Cross-repo visibility: yes.

| Signal | Measured | Threshold | Status | Since |
|---|---|---|---|---|
| heartbeat.fresh | src=saos-runtime@main:state/beat/ci-last-heartbeat.json age=34m http=200 | red if missing/unparseable OR age>5400s (90m fail-loud) OR age>2400s (40m) with no runtime run in-flight | GREEN | 2026-10-19T15:04:38.359Z |
| anchor.probe | verdict=OK age=34m src=steem@saos-cockpit:state/anchor-probe.json | verdict=OK and age<=24h (probe verdict recorded by the beat, mirrored here) | GREEN | 2026-10-19T15:04:38Z |
| custody.coverage | verified=14/total=14 | verified>=14 | GREEN | 2026-10-19T15:04:38.359Z |
| social.verdict | verdict=SOCIAL-STANDBY executed=None refused=None | verdict in green set (WAIT = designed gate state) | WAIT (designed) | 2026-10-19T15:04:38.359Z |
| content.verdict | verdict=QUEUED draftsQueued=None | verdict in green set (anything else red) | GREEN | 2026-10-19T15:04:38.359Z |
| dex.anchor | verdict=TAKEOVER-EXECUTED anchorAgeMs=unavailable | anchorAgeMs<=86400000 (24h); WAIT = engine-standby is designed | WAIT (designed) | 2026-10-19T15:04:38.359Z |
| blurt.live | verdict=BLURT-RPC-UNREACHABLE live=0/None | live>=1 | RED | 2026-10-19T15:04:38.359Z |
| delegation.verdict | verdict=ALREADY-TODAY ops=0 | verdict in green set (WAIT = custody gate refusal is the brake working) | GREEN | 2026-10-19T15:04:38.359Z |
| digest.verdict | verdict=COOLDOWN slot=None | verdict in green set (COOLDOWN is normal pacing) | GREEN | 2026-10-19T15:04:38.359Z |
| pulse.fresh | age=34m conclusion=status=queued run=39274658183 | red if failed OR age>5400s (90m fail-loud) OR age>2400s (40m) not in-flight | GREEN | 2026-10-19T15:04:09Z |
| potential.fresh | age=2.4h path=office-pages:potential.json | age<=93600s (26h) | GREEN | 2026-10-19T13:16:45Z |
| fleetdigest.fresh | age=2.4h path=office-pages:digest.json | age<=93600s (26h) | GREEN | 2026-10-19T13:16:45Z |
| office.schedule | age=2.4h conclusion=success | newest schedule run age<=93600s (26h) | GREEN | 2026-10-19T13:16:19Z |
| billing.block | no billing-block annotation (0 failed run(s) of 0 in last 15) | no 'payments have failed'/'spending limit' annotations on recent failed runs | GREEN | unavailable |

Legend:
- RED: the measured value crossed its threshold; RED rows are mirrored in the open GRID-ALERT issue.
- GREEN: within threshold. WAIT (designed): a designed gate/standby state — visible, not alarmed, not silenced.
- UNAVAILABLE: the signal could not be measured and is treated as RED until proven otherwise.
- Auto-managed by grid-watchdog; machine state in state/grid-status.json. Telemetry only — no keys, no account identifiers.
