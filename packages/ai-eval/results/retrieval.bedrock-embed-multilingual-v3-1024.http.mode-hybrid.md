### retrieval — cohere.embed-multilingual-v3 (1024 dims, cutoff 0.44) + RRF k = 60, http, hybrid

| cases | recall@5 (real) | title/author | description | cross-lingual | paraphrase | near-duplicate | nonsense (empty) | p50 | p95 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 49 | 95.3 % | 100.0 % | 100.0 % | 75.0 % | 100.0 % | 100.0 % | 100.0 % | 396 ms | 602 ms |

<details><summary>Misses</summary>

| case | query | expected | top 5 |
| --- | --- | --- | --- |
| r-26 | une famille chassée de sa ferme par la poussière part chercher du travail en Californie | 55 | — |
| r-30 | وباء يجتاح مدينة وهران فيختار طبيب أن يقاومه | 103 | — |

</details>
