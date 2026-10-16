### agent — bedrock (eu.anthropic.claude-haiku-4-5-20251001-v1:0), judge eu.anthropic.claude-haiku-4-5-20251001-v1:0, inprocess

| cases | n | all checks + judge | tools | pending action | nothing written | cited | judge: grounded | judge: cited | judge: no unconfirmed change | judge: answers | agent cost / case | p50 | p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tuned (rubric fixed on these) | 1 | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | $0.00630 | 2840 ms | 2840 ms |

The four checks are deterministic: the expected tools ran (or none did), the turn ended with the expected pending action (or none), the shelf is unchanged, and an expected book is cited. The judge grades the prose against the tool evidence. Latency is the agent turn that answered (a turn retried after a Bedrock 429 counts once). Total $0.0094 (judge $0.0031) · 0 errors · 0 throttle retries.
