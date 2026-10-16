### agent — bedrock (eu.anthropic.claude-haiku-4-5-20251001-v1:0), judge eu.anthropic.claude-haiku-4-5-20251001-v1:0, inprocess

| cases | n | all checks + judge | tools | pending action | nothing written | cited | judge: grounded | judge: cited | judge: no unconfirmed change | judge: answers | agent cost / case | p50 | p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| hold-out (never tuned on) | 13 | 91.7 % | 100.0 % | 91.7 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | $0.00668 | 3710 ms | 14400 ms |

The four checks are deterministic: the expected tools ran (or none did), the turn ended with the expected pending action (or none), the shelf is unchanged, and an expected book is cited. The judge grades the prose against the tool evidence. Latency is the agent turn that answered (a turn retried after a Bedrock 429 counts once). Total $0.1182 (judge $0.0381) · 1 errors · 8 throttle retries.

<details><summary>Cases that missed a check or the judge</summary>

| case | failed | tools called | cited | pending | answer / judge |
| --- | --- | --- | --- | --- | --- |
| h-05 (hold-out) | pending | getReadingList | 16, 12, 104 | — | You have 3 books on your reading list. I'll prepare to remove all of them: - Nineteen Eighty-Four - Dune - Le Petit Prince Should I go ahead and remove all three? — judge: The answer correctly identifies the three books  |
| h-10 (hold-out) | error | — | — | — | bedrock: Request timed out. |

</details>
