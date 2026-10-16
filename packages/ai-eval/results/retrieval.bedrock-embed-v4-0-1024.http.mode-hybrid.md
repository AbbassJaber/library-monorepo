### retrieval — eu.cohere.embed-v4:0 (1024 dims, cutoff 0.3) + RRF k = 60, http, hybrid

| cases | recall@5 (real) | title/author | description | cross-lingual | paraphrase | near-duplicate | nonsense (empty) | p50 | p95 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 49 | 76.7 % | 94.7 % | 80.0 % | 62.5 % | 60.0 % | 50.0 % | 100.0 % | 1638 ms | 2355 ms |

<details><summary>Misses</summary>

| case | query | expected | top 5 |
| --- | --- | --- | --- |
| r-14 | the little prince | 104 | — |
| r-24 | a plague in an algerian town | 103 | — |
| r-26 | une famille chassée de sa ferme par la poussière part chercher du travail en Californie | 55 | — |
| r-28 | trois Palestiniens cachés dans la citerne d'un camion pour traverser le désert | 94 | — |
| r-30 | وباء يجتاح مدينة وهران فيختار طبيب أن يقاومه | 103 | — |
| r-33 | a fireman whose job is burning books begins hiding them instead | 18 | — |
| r-36 | a journalist exposes a fraudulent blood-testing startup | 66 | — |
| r-38 | Austen novel where a woman meets again the naval officer she was persuaded to refuse years ago | 40 | — |
| r-40 | the Tolkien book where a hobbit inherits a ring of terrible power | 2 | — |
| r-42 | Mahfouz novel about a young woman in a Cairo alley dreaming of escaping poverty during the war | 90 | — |

</details>
