# Grid status

Generated 2026-10-18T07:39:21Z by grid-watchdog (schedule 13,43 * * * * UTC). Cross-repo visibility: yes.

| Signal | Measured | Threshold | Status | Since |
|---|---|---|---|---|
| heartbeat.fresh | src=saos-runtime@main:state/beat/ci-last-heartbeat.json age=1.6h http=200 | red if missing/unparseable OR age>5400s (90m fail-loud) OR age>2400s (40m) with no runtime run in-flight | RED | 2026-10-18T06:03:36.234Z |
| anchor.probe | verdict=OK age=1.6h src=steem@saos-cockpit:state/anchor-probe.json | verdict=OK and age<=24h (probe verdict recorded by the beat, mirrored here) | GREEN | 2026-10-18T06:03:36Z |
| custody.coverage | verified=14/total=14 | verified>=14 | GREEN | 2026-10-18T06:03:36.234Z |
| social.verdict | verdict=SOCIAL-STANDBY executed=None refused=None | verdict in green set (WAIT = designed gate state) | WAIT (designed) | 2026-10-18T06:03:36.234Z |
| content.verdict | verdict=QUEUED draftsQueued=None | verdict in green set (anything else red) | GREEN | 2026-10-18T06:03:36.234Z |
| dex.anchor | verdict=STANDBY anchorAgeMs=unavailable | anchorAgeMs<=86400000 (24h); WAIT = engine-standby is designed | WAIT (designed) | 2026-10-18T06:03:36.234Z |
| blurt.live | verdict=BLURT-BODIES-LIVE live=12/None | live>=1 | GREEN | 2026-10-18T06:03:36.234Z |
| delegation.verdict | verdict=ALREADY-TODAY ops=0 | verdict in green set (WAIT = custody gate refusal is the brake working) | GREEN | 2026-10-18T06:03:36.234Z |
| digest.verdict | verdict=COOLDOWN slot=None | verdict in green set (COOLDOWN is normal pacing) | GREEN | 2026-10-18T06:03:36.234Z |
| pulse.fresh | age=1.6h conclusion=failure run=39102670666 | red if failed OR age>5400s (90m fail-loud) OR age>2400s (40m) not in-flight | RED | 2026-10-18T06:03:14Z |
| potential.fresh | age=8.4h path=office-pages:potential.json | age<=93600s (26h) | GREEN | 2026-10-17T23:16:54Z |
| fleetdigest.fresh | age=34s path=office-pages:digest.json | age<=93600s (26h) | GREEN | 2026-10-18T07:38:42Z |
| office.schedule | age=8.4h conclusion=success | newest schedule run age<=93600s (26h) | GREEN | 2026-10-17T23:16:26Z |
| billing.block | no billing-block annotation (2 failed run(s) of 3 in last 15) | no 'payments have failed'/'spending limit' annotations on recent failed runs | GREEN | unavailable |

Legend:
- RED: the measured value crossed its threshold; RED rows are mirrored in the open GRID-ALERT issue.
- GREEN: within threshold. WAIT (designed): a designed gate/standby state — visible, not alarmed, not silenced.
- UNAVAILABLE: the signal could not be measured and is treated as RED until proven otherwise.
- Auto-managed by grid-watchdog; machine state in state/grid-status.json. Telemetry only — no keys, no account identifiers.
