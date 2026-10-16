### Retrieval: lexical vs hybrid vs hybrid + rerank — amazon.titan-embed-text-v2:0, rerank eu.anthropic.claude-haiku-4-5-20251001-v1:0

| variant | recall@5 | title/author | description | hit@1 | MRR@5 | cost / query | p50 | p95 | fallbacks |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| lexical | 83.3 % | 94.7 % | 40.0 % | 83.3 % | 0.833 | $0.00000 | 15 ms | 22 ms | 0 |
| hybrid (RRF k = 60) | 100.0 % | 100.0 % | 100.0 % | 95.8 % | 0.979 | $0.00000 | 427 ms | 493 ms | 0 |
| hybrid + rerank | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 1.000 | $0.00298 | 1297 ms | 1483 ms | 0 |

Rerank adds +0.0 points recall@5 over hybrid (title/author +0.0, description +0.0), +4.2 points hit@1 and 0.021 MRR@5, for $0.00298 per query and 990 ms at p95.

The lexical misses, and which variant finds them:

| case | query | hybrid | hybrid + rerank |
| --- | --- | --- | --- |
| r-14 | the little prince | yes | yes |
| r-15 | a boy wizard at a school of magic | yes | yes |
| r-17 | desert planet with giant worms | yes | yes |
| r-24 | a plague in an algerian town | yes | yes |

Rerank throttle retries (Bedrock quota, retried, not counted as quality): 11.
