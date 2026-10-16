### nl-search — bedrock (eu.anthropic.claude-haiku-4-5-20251001-v1:0), inprocess, cache padding off

| cases | exact | q | genre | yearFrom | yearTo | sort | EN / FR / AR exact | fallback | cost / query | cache write / steady | p50 | p95 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | ---: | ---: |
| 34 | 97.1 % | 97.1 % | 97.1 % | 100.0 % | 100.0 % | 100.0 % | 93.8 % / 100.0 % / 100.0 % | 0.0 % | $0.00339 | — / $0.00339 | 1315 ms | 1980 ms |

Total $0.11530 · mean 2456 input tokens · 0 cache-read tokens · 0 cache writes · 0 errors · 17 throttle retries (429, quota)

<details><summary>Misses</summary>

| case | text | expected | got |
| --- | --- | --- | --- |
| en-14 | best classics | `{"genre":["literary-fiction"],"sort":"rating"}` | `{"q":"classics","sort":"rating"}` |

</details>
