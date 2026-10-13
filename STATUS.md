# Grid status

Generated 2026-10-13T16:23:27Z by grid-watchdog (schedule 13,43 * * * * UTC). Cross-repo visibility: yes.

| Signal | Measured | Threshold | Status | Since |
|---|---|---|---|---|
| heartbeat.fresh | src=saos-runtime@main:state/beat/ci-last-heartbeat.json age=4m http=200 | age<=2400s (40m); missing/unparseable is red | GREEN | 2026-10-13T16:19:38.457Z |
| anchor.probe | verdict=OK age=4m src=steem@saos-cockpit:state/anchor-probe.json | verdict=OK and age<=24h (probe verdict recorded by the beat, mirrored here) | GREEN | 2026-10-13T16:19:38Z |
| custody.coverage | verified=1/total=14 | verified>=14 | RED | 2026-10-13T16:19:38.457Z |
| social.verdict | verdict=PART-GATED executed=None refused=None | verdict in green set (WAIT = designed gate state) | WAIT (designed) | 2026-10-13T16:19:38.457Z |
| content.verdict | verdict=BRIDGE-DOWN draftsQueued=None | verdict in green set (anything else red) | RED | 2026-10-13T16:19:38.457Z |
| dex.anchor | verdict=STANDBY anchorAgeMs=unavailable | anchorAgeMs<=86400000 (24h); WAIT = engine-standby is designed | WAIT (designed) | 2026-10-13T16:19:38.457Z |
| blurt.live | verdict=BLURT-BODIES-LIVE live=None/None | live>=1 | RED | 2026-10-13T16:19:38.457Z |
| delegation.verdict | verdict=CUSTODY-GATE-REFUSED ops=None | verdict in green set (WAIT = custody gate refusal is the brake working) | WAIT (designed) | 2026-10-13T16:19:38.457Z |
| digest.verdict | verdict=COOLDOWN slot=None | verdict in green set (COOLDOWN is normal pacing) | GREEN | 2026-10-13T16:19:38.457Z |
| pulse.fresh | age=4m conclusion=status=in_progress run=38429510628 | age<=2400s (40m) and conclusion=success | GREEN | 2026-10-13T16:19:10Z |
| potential.fresh | age=2.2h path=office-pages:potential.json | age<=93600s (26h) | GREEN | 2026-10-13T14:12:30Z |
| fleetdigest.fresh | age=1.8h path=office-pages:digest.json | age<=93600s (26h) | GREEN | 2026-10-13T14:37:19Z |
| office.schedule | age=2.2h conclusion=success | newest schedule run age<=93600s (26h) | GREEN | 2026-10-13T14:12:08Z |
| billing.block | no billing-block annotation (0 failed run(s) of 0 in last 15) | no 'payments have failed'/'spending limit' annotations on recent failed runs | GREEN | unavailable |

Legend:
- RED: the measured value crossed its threshold; RED rows are mirrored in the open GRID-ALERT issue.
- GREEN: within threshold. WAIT (designed): a designed gate/standby state — visible, not alarmed, not silenced.
- UNAVAILABLE: the signal could not be measured and is treated as RED until proven otherwise.
- Auto-managed by grid-watchdog; machine state in state/grid-status.json. Telemetry only — no keys, no account identifiers.
