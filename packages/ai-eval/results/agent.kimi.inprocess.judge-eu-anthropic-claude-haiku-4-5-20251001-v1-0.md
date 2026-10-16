### agent — kimi (kimi-k3), judge eu.anthropic.claude-haiku-4-5-20251001-v1:0, inprocess

| cases | n | all checks + judge | tools | pending action | nothing written | cited | judge: grounded | judge: cited | judge: no unconfirmed change | judge: answers | agent cost / case | p50 | p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tuned (rubric fixed on these) | 18 | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | $0.00789 | 15960 ms | 41564 ms |
| hold-out (never tuned on) | 11 | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | $0.00875 | 20584 ms | 36045 ms |
| all | 29 | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | $0.00822 | 17394 ms | 38910 ms |

The four checks are deterministic: the expected tools ran (or none did), the turn ended with the expected pending action (or none), the shelf is unchanged, and an expected book is cited. The judge grades the prose against the tool evidence. Latency is the agent turn that answered (a turn retried after a Bedrock 429 counts once). Total $0.3436 (judge $0.1053) · 0 errors · 0 throttle retries.
