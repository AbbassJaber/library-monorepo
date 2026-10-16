### agent — bedrock (eu.anthropic.claude-haiku-4-5-20251001-v1:0), judge eu.anthropic.claude-haiku-4-5-20251001-v1:0, inprocess

| cases | n | all checks + judge | tools | pending action | nothing written | cited | judge: grounded | judge: cited | judge: no unconfirmed change | judge: answers | agent cost / case | p50 | p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tuned (rubric fixed on these) | 18 | 88.9 % | 100.0 % | 94.4 % | 100.0 % | 94.4 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | $0.00497 | 18666 ms | 53551 ms |
| hold-out (never tuned on) | 11 | 90.9 % | 100.0 % | 90.9 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | $0.00474 | 25098 ms | 32982 ms |
| all | 29 | 89.7 % | 100.0 % | 93.1 % | 100.0 % | 96.6 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | $0.00488 | 24700 ms | 50217 ms |

The four checks are deterministic: the expected tools ran (or none did), the turn ended with the expected pending action (or none), the shelf is unchanged, and an expected book is cited. The judge grades the prose against the tool evidence. Total $0.2298 (judge $0.0882) · 0 errors · 41 throttle retries.

<details><summary>Cases that missed a check or the judge</summary>

| case | failed | tools called | cited | pending | answer / judge |
| --- | --- | --- | --- | --- | --- |
| g-03 | cited | searchBooks | — | — | The search didn't find any books matching that description in our catalog. You might try searching for related terms like "desert planet," "science fiction," or specific author names if you have them in mind. Would you l |
| g-07 | pending | searchBooks, updateReadingState | 1 | updateReadingState {"bookId":1,"state":"READING"} | I'm ready to mark The Hobbit as "Reading" on your list. Please confirm this change. — judge: The answer correctly addresses the user's request to mark "The Hobbit" as "Reading" on their list. The book is properly cited w |
| h-03 (hold-out) | pending | searchBooks, updateReadingState | 16 | updateReadingState {"bookId":16,"state":"FINISHED"} | Ready to mark Nineteen Eighty-Four by George Orwell as finished on your reading list. Please confirm this change. — judge: The answer correctly identifies the book "Nineteen Eighty-Four" by George Orwell from the search  |

</details>
