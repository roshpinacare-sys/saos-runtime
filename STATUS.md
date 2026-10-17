# Grid status

Generated 2026-10-17T12:33:45Z by grid-watchdog (schedule 13,43 * * * * UTC). Cross-repo visibility: yes.

| Signal | Measured | Threshold | Status | Since |
|---|---|---|---|---|
| heartbeat.fresh | src=saos-runtime@main:state/beat/ci-last-heartbeat.json age=27m http=200 | age<=2400s (40m); missing/unparseable is red | GREEN | 2026-10-17T12:06:56.388Z |
| anchor.probe | verdict=OK age=27m src=steem@saos-cockpit:state/anchor-probe.json | verdict=OK and age<=24h (probe verdict recorded by the beat, mirrored here) | GREEN | 2026-10-17T12:06:56Z |
| custody.coverage | verified=14/total=14 | verified>=14 | GREEN | 2026-10-17T12:06:56.388Z |
| social.verdict | verdict=SOCIAL-STANDBY executed=None refused=None | verdict in green set (WAIT = designed gate state) | WAIT (designed) | 2026-10-17T12:06:56.388Z |
| content.verdict | verdict=QUEUED draftsQueued=None | verdict in green set (anything else red) | GREEN | 2026-10-17T12:06:56.388Z |
| dex.anchor | verdict=STANDBY anchorAgeMs=unavailable | anchorAgeMs<=86400000 (24h); WAIT = engine-standby is designed | WAIT (designed) | 2026-10-17T12:06:56.388Z |
| blurt.live | verdict=BLURT-BODIES-LIVE live=12/None | live>=1 | GREEN | 2026-10-17T12:06:56.388Z |
| delegation.verdict | verdict=ALREADY-TODAY ops=0 | verdict in green set (WAIT = custody gate refusal is the brake working) | GREEN | 2026-10-17T12:06:56.388Z |
| digest.verdict | verdict=COOLDOWN slot=None | verdict in green set (COOLDOWN is normal pacing) | GREEN | 2026-10-17T12:06:56.388Z |
| pulse.fresh | age=27m conclusion=status=in_progress run=39031223959 | age<=2400s (40m) and conclusion=success | GREEN | 2026-10-17T12:06:25Z |
| potential.fresh | age=1.8h path=office-pages:potential.json | age<=93600s (26h) | GREEN | 2026-10-17T10:47:52Z |
| fleetdigest.fresh | age=21.6h path=main:t19b/mirror/Domain/office3d/digest.json | age<=93600s (26h) | GREEN | 2026-10-16T14:58:40Z |
| office.schedule | age=1.8h conclusion=success | newest schedule run age<=93600s (26h) | GREEN | 2026-10-17T10:47:27Z |
| billing.block | no billing-block annotation (2 failed run(s) of 3 in last 15) | no 'payments have failed'/'spending limit' annotations on recent failed runs | GREEN | unavailable |

Legend:
- RED: the measured value crossed its threshold; RED rows are mirrored in the open GRID-ALERT issue.
- GREEN: within threshold. WAIT (designed): a designed gate/standby state — visible, not alarmed, not silenced.
- UNAVAILABLE: the signal could not be measured and is treated as RED until proven otherwise.
- Auto-managed by grid-watchdog; machine state in state/grid-status.json. Telemetry only — no keys, no account identifiers.
