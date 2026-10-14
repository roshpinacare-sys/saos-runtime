# Grid status

Generated 2026-10-14T04:22:39Z by grid-watchdog (schedule 13,43 * * * * UTC). Cross-repo visibility: yes.

| Signal | Measured | Threshold | Status | Since |
|---|---|---|---|---|
| heartbeat.fresh | src=saos-runtime@main:state/beat/ci-last-heartbeat.json age=17m http=200 | age<=2400s (40m); missing/unparseable is red | GREEN | 2026-10-14T04:05:55.906Z |
| anchor.probe | verdict=OK age=3.4h src=steem@saos-cockpit:state/anchor-probe.json | verdict=OK and age<=24h (probe verdict recorded by the beat, mirrored here) | GREEN | 2026-10-14T01:01:06Z |
| custody.coverage | verified=13/total=14 | verified>=14 | RED | 2026-10-14T04:05:55.906Z |
| social.verdict | verdict=SOCIAL-STANDBY executed=None refused=None | verdict in green set (WAIT = designed gate state) | WAIT (designed) | 2026-10-14T04:05:55.906Z |
| content.verdict | verdict=DRAFTS-QUEUED draftsQueued=None | verdict in green set (anything else red) | GREEN | 2026-10-14T04:05:55.906Z |
| dex.anchor | verdict=TAKEOVER-EXECUTED anchorAgeMs=unavailable | anchorAgeMs<=86400000 (24h); WAIT = engine-standby is designed | WAIT (designed) | 2026-10-14T04:05:55.906Z |
| blurt.live | verdict=BLURT-BODIES-LIVE live=12/None | live>=1 | GREEN | 2026-10-14T04:05:55.906Z |
| delegation.verdict | verdict=CUSTODY-GATE-REFUSED ops=None | verdict in green set (WAIT = custody gate refusal is the brake working) | WAIT (designed) | 2026-10-14T04:05:55.906Z |
| digest.verdict | verdict=COOLDOWN slot=None | verdict in green set (COOLDOWN is normal pacing) | GREEN | 2026-10-14T04:05:55.906Z |
| pulse.fresh | age=14m conclusion=status=pending run=38509887630 | age<=2400s (40m) and conclusion=success | GREEN | 2026-10-14T04:08:49Z |
| potential.fresh | age=4.0h path=office-pages:potential.json | age<=93600s (26h) | GREEN | 2026-10-14T00:23:56Z |
| fleetdigest.fresh | age=14m path=office-pages:digest.json | age<=93600s (26h) | GREEN | 2026-10-14T04:08:44Z |
| office.schedule | age=4.0h conclusion=success | newest schedule run age<=93600s (26h) | GREEN | 2026-10-14T00:23:37Z |
| billing.block | no billing-block annotation (0 failed run(s) of 0 in last 15) | no 'payments have failed'/'spending limit' annotations on recent failed runs | GREEN | unavailable |

Legend:
- RED: the measured value crossed its threshold; RED rows are mirrored in the open GRID-ALERT issue.
- GREEN: within threshold. WAIT (designed): a designed gate/standby state — visible, not alarmed, not silenced.
- UNAVAILABLE: the signal could not be measured and is treated as RED until proven otherwise.
- Auto-managed by grid-watchdog; machine state in state/grid-status.json. Telemetry only — no keys, no account identifiers.
