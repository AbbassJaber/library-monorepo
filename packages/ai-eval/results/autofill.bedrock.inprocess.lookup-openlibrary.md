### autofill — bedrock (eu.anthropic.claude-haiku-4-5-20251001-v1:0), inprocess, lookup openlibrary

| cases | exact strict / lenient | title | author | year | genres strict / lenient | synopsis | EN / FR / AR exact | lookup hits | model right/filled: author · year · synopsis · genres | fallback | cost / case | total p50 / p95 | model p95 |
| ---: | --- | ---: | ---: | ---: | --- | ---: | --- | ---: | --- | ---: | ---: | --- | ---: |
| 24 | 75.0 % / 79.2 % | 100.0 % | 95.8 % | 83.3 % | 91.7 % / 100.0 % | 100.0 % | 87.5 % / 50.0 % / 50.0 % | 91.7 % | 0/0 · 1/1 · 4/4 · 21/23 | 0.0 % | $0.00287 | 1911 / 3549 ms | 2595 ms |

Year second opinion: 3 of 4 wrong Open Library years flagged (3 with the right year) · 0 false flags on 18 right years.

Total $0.06881 · 23 model calls · mean 2153 input / 113 output tokens · 0 errors · 5 throttle retries (429, quota)

<details><summary>Misses</summary>

| case | input | wrong fields | got (source) |
| --- | --- | --- | --- |
| i-06 | 9780141439600 | year | year: 1800 (lookup, AI says 1859) |
| i-07 | 9780441172719 | genres | genres: [2,1] (model) |
| f-02 | L'Écume des jours / Boris Vian | year | year: 1963 (lookup, AI says 1947) |
| f-04 | Le Petit Nicolas / René Goscinny | author, genres | author: "Jean-Jacques Sempé" (lookup); genres: [12,7] (model) |
| a-01 | بين القصرين / نجيب محفوظ | year | year: 1960 (lookup, AI says 1956) |
| a-04 | يوميات نائب في الأرياف / توفيق الحكيم | year | year: 1988 (lookup) |

</details>
