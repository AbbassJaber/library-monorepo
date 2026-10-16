### retrieval — amazon.titan-embed-text-v2:0 (512 dims, cutoff 0) + RRF k = 60, http, hybrid

| cases | recall@5 (real) | title/author | description | cross-lingual | paraphrase | near-duplicate | nonsense (empty) | p50 | p95 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 49 | 95.3 % | 100.0 % | 100.0 % | 75.0 % | 100.0 % | 100.0 % | 0.0 % | 897 ms | 1735 ms |

<details><summary>Misses</summary>

| case | query | expected | top 5 |
| --- | --- | --- | --- |
| r-26 | une famille chassée de sa ferme par la poussière part chercher du travail en Californie | 55 | 93, 118, 79, 17, 23 |
| r-28 | trois Palestiniens cachés dans la citerne d'un camion pour traverser le désert | 94 | 34, 21, 4, 56, 11 |
| r-44 | xqzv plorbt wuggle frim | (nothing) | 95, 11, 58, 4, 110 |
| r-45 | asdfghjkl qwertyuiop | (nothing) | 36, 120, 87, 25, 98 |
| r-46 | zzzz zzzz zzzz | (nothing) | 110, 102, 38, 111, 95 |
| r-47 | كفتخ زبرطل شمقرط | (nothing) | 7, 113, 94, 11, 90 |
| r-48 | lkjh mnbv poiu vcxz | (nothing) | 120, 25, 74, 72, 78 |
| r-49 | blorft snargle vimpish quonk | (nothing) | 69, 59, 8, 17, 21 |

</details>
