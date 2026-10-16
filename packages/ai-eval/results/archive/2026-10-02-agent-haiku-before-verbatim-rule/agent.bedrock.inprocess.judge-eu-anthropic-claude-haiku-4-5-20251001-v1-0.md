### agent — bedrock (eu.anthropic.claude-haiku-4-5-20251001-v1:0), judge eu.anthropic.claude-haiku-4-5-20251001-v1:0, inprocess

| cases | n | all checks + judge | tools | pending action | nothing written | cited | judge: grounded | judge: cited | judge: no unconfirmed change | judge: answers | agent cost / case | p50 | p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tuned (rubric fixed on these) | 18 | 94.1 % | 100.0 % | 100.0 % | 100.0 % | 94.1 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | $0.00516 | 3953 ms | 16974 ms |
| hold-out (never tuned on) | 11 | 90.9 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 90.9 % | $0.00522 | 3046 ms | 7441 ms |
| all | 29 | 92.9 % | 100.0 % | 100.0 % | 100.0 % | 96.4 % | 100.0 % | 100.0 % | 100.0 % | 96.4 % | $0.00519 | 3463 ms | 7441 ms |

The four checks are deterministic: the expected tools ran (or none did), the turn ended with the expected pending action (or none), the shelf is unchanged, and an expected book is cited. The judge grades the prose against the tool evidence. Latency is the agent turn that answered (a turn retried after a Bedrock 429 counts once). Total $0.2344 (judge $0.0891) · 1 errors · 32 throttle retries.

<details><summary>Cases that missed a check or the judge</summary>

| case | failed | tools called | cited | pending | answer / judge |
| --- | --- | --- | --- | --- | --- |
| g-03 | cited | searchBooks | — | — | The catalog doesn't have a book matching that description. Try searching for "Dune" by title, or let me know if you'd like to search for something else in our collection. — judge: The answer correctly addresses the user' |
| g-08 | error | — | — | — | bedrock: Request timed out. |
| h-05 (hold-out) | judge:answers | — | — | — | I can help you manage your reading list one book at a time. To remove books, I'd need to know which specific books you want to remove. Could you tell me which book(s) you'd like to remove from your reading list? Or if yo |

</details>
