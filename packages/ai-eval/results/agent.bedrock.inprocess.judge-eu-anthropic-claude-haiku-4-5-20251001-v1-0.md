### agent — bedrock (eu.anthropic.claude-haiku-4-5-20251001-v1:0), judge eu.anthropic.claude-haiku-4-5-20251001-v1:0, inprocess

| cases | n | all checks + judge | tools | pending action | nothing written | cited | judge: grounded | judge: cited | judge: no unconfirmed change | judge: answers | agent cost / case | p50 | p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tuned (rubric fixed on these) | 19 | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | $0.00682 | 3339 ms | 34857 ms |
| hold-out (never tuned on) | 14 | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | $0.00758 | 2670 ms | 4429 ms |
| all | 33 | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | $0.00714 | 2884 ms | 13767 ms |

The four checks are deterministic: the expected tools ran (or none did), the turn ended with the expected pending action (or none), the shelf is unchanged, and an expected book is cited. The judge grades the prose against the tool evidence. Latency is the agent turn that answered (a turn retried after a Bedrock 429 counts once). Total $0.3439 (judge $0.1083) · 0 errors · 46 throttle retries.
