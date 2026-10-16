### retrieval — amazon.titan-embed-text-v2:0 (512 dims) + RRF k = 60, http, hybrid

| cases | recall@5 (real) | title/author | description | cross-lingual | paraphrase | near-duplicate | nonsense (empty) | p50 | p95 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 49 | 88.4 % | 100.0 % | 80.0 % | 50.0 % | 100.0 % | 100.0 % | 100.0 % | 458 ms | 1452 ms |

<details><summary>Misses</summary>

| case | query | expected | top 5 |
| --- | --- | --- | --- |
| r-17 | desert planet with giant worms | 12 | — |
| r-26 | une famille chassée de sa ferme par la poussière part chercher du travail en Californie | 55 | — |
| r-28 | trois Palestiniens cachés dans la citerne d'un camion pour traverser le désert | 94 | — |
| r-29 | عائلة نبيلة تتولى حكم كوكب صحراوي ينتج أثمن مادة في الكون | 12 | — |
| r-30 | وباء يجتاح مدينة وهران فيختار طبيب أن يقاومه | 103 | — |

</details>
