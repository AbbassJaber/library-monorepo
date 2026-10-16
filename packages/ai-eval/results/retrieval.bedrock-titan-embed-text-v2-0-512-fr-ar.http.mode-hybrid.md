### retrieval — amazon.titan-embed-text-v2:0 (512 dims, FR/AR expansion, cutoff 0) + RRF k = 60, http, hybrid

| cases | recall@5 (real) | title/author | description | cross-lingual | paraphrase | near-duplicate | nonsense (empty) | p50 | p95 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 49 | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 0.0 % | 949 ms | 1289 ms |

<details><summary>Misses</summary>

| case | query | expected | top 5 |
| --- | --- | --- | --- |
| r-44 | xqzv plorbt wuggle frim | (nothing) | 11, 95, 7, 110, 58 |
| r-45 | asdfghjkl qwertyuiop | (nothing) | 120, 36, 89, 98, 83 |
| r-46 | zzzz zzzz zzzz | (nothing) | 110, 15, 102, 38, 96 |
| r-47 | كفتخ زبرطل شمقرط | (nothing) | 87, 7, 113, 11, 89 |
| r-48 | lkjh mnbv poiu vcxz | (nothing) | 120, 96, 25, 7, 31 |
| r-49 | blorft snargle vimpish quonk | (nothing) | 107, 11, 69, 59, 88 |

</details>
