### nl-search — mock (mock-small), inprocess, cache padding off

| cases | exact | q | genre | yearFrom | yearTo | sort | EN / FR / AR exact | fallback | cost / query | cache write / steady | p50 | p95 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | ---: | ---: |
| 34 | 79.4 % | 79.4 % | 100.0 % | 100.0 % | 100.0 % | 91.2 % | 81.3 % / 77.8 % / 77.8 % | 0.0 % | $0.00000 | — / $0.00000 | 1 ms | 5 ms |

Total $0.00000 · mean 1225 input tokens · 0 cache-read tokens · 0 cache writes · 0 errors · 0 throttle retries (429, quota)

<details><summary>Misses</summary>

| case | text | expected | got |
| --- | --- | --- | --- |
| en-04 | fantasy books for kids | `{"genre":["fantasy","children"]}` | `{"q":"for","genre":["fantasy","children"]}` |
| en-06 | new spy thrillers | `{"genre":["thriller"],"sort":"newest"}` | `{"q":"new spy","genre":["thriller"]}` |
| en-12 | detective stories between 1930 and 1940 | `{"genre":["mystery"],"yearFrom":1930,"yearTo":1940}` | `{"q":"stories","genre":["mystery"],"yearFrom":1930,"yearTo":1940}` |
| fr-03 | les meilleurs polars | `{"genre":["mystery"],"sort":"rating"}` | `{"q":"meilleurs","genre":["mystery"]}` |
| fr-08 | biographies par ordre alphabétique | `{"genre":["biography"],"sort":"title"}` | `{"q":"ordre","genre":["biography"],"sort":"title"}` |
| ar-06 | أحدث روايات الخيال العلمي | `{"genre":["science-fiction"],"sort":"newest"}` | `{"q":"احدث","genre":["science-fiction"]}` |
| ar-07 | مذكرات وسير ذاتية | `{"genre":["biography"]}` | `{"q":"وسير ذاتية","genre":["biography"]}` |

</details>
