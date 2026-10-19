# Grid status

Generated 2026-10-19T14:33:40Z by grid-watchdog (schedule 13,43 * * * * UTC). Cross-repo visibility: yes.

| Signal | Measured | Threshold | Status | Since |
|---|---|---|---|---|
| heartbeat.fresh | src=steem@saos-cockpit:mini-services/saos-engine/state/ci-last-heartbeat.json age=unavailable http=403 | red if missing/unparseable OR age>5400s (90m fail-loud) OR age>2400s (40m) with no runtime run in-flight | UNAVAILABLE | unavailable |
| anchor.probe | verdict=unavailable age=unavailable src=steem@saos-cockpit:state/anchor-probe.json | verdict=OK and age<=24h (probe verdict recorded by the beat, mirrored here) | UNAVAILABLE | unavailable |
| custody.coverage | verified=None/total=None | verified>=14 | RED | unavailable |
| social.verdict | verdict=None executed=None refused=None | verdict in green set (WAIT = designed gate state) | RED | unavailable |
| content.verdict | verdict=None draftsQueued=None | verdict in green set (anything else red) | RED | unavailable |
| dex.anchor | verdict=None anchorAgeMs=unavailable | anchorAgeMs<=86400000 (24h); WAIT = engine-standby is designed | UNAVAILABLE | unavailable |
| blurt.live | verdict=None live=None/None | live>=1 | RED | unavailable |
| delegation.verdict | verdict=None ops=None | verdict in green set (WAIT = custody gate refusal is the brake working) | RED | unavailable |
| digest.verdict | verdict=None slot=None | verdict in green set (COOLDOWN is normal pacing) | RED | unavailable |
| pulse.fresh | age=31m conclusion=status=in_progress run=39265432473 | red if failed OR age>5400s (90m fail-loud) OR age>2400s (40m) not in-flight | GREEN | 2026-10-19T14:02:55Z |
| potential.fresh | unavailable: potential.json not found (branches searched: main; tree codes: main:403) | age<=93600s (26h) | UNAVAILABLE | unavailable |
| fleetdigest.fresh | unavailable: digest.json not found (branches searched: main; tree codes: main:403) | age<=93600s (26h) | UNAVAILABLE | unavailable |
| office.schedule | age=77m conclusion=success | newest schedule run age<=93600s (26h) | GREEN | 2026-10-19T13:16:19Z |
| billing.block | unavailable: recent runs not readable (http=403) | no 'payments have failed'/'spending limit' annotations on recent failed runs | UNAVAILABLE | unavailable |

Legend:
- RED: the measured value crossed its threshold; RED rows are mirrored in the open GRID-ALERT issue.
- GREEN: within threshold. WAIT (designed): a designed gate/standby state — visible, not alarmed, not silenced.
- UNAVAILABLE: the signal could not be measured and is treated as RED until proven otherwise.
- Auto-managed by grid-watchdog; machine state in state/grid-status.json. Telemetry only — no keys, no account identifiers.
