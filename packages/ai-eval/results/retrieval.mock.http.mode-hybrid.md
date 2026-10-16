### retrieval — mock-embedding (384 dims) + RRF k = 60, http, hybrid

| cases | recall@5 (real) | title/author | description | cross-lingual | paraphrase | near-duplicate | nonsense (empty) | p50 | p95 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 49 | 65.1 % | 94.7 % | 40.0 % | 0.0 % | 80.0 % | 66.7 % | 100.0 % | 22 ms | 33 ms |

<details><summary>Misses</summary>

| case | query | expected | top 5 |
| --- | --- | --- | --- |
| r-14 | the little prince | 104 | 70, 69, 65 |
| r-15 | a boy wizard at a school of magic | 10 | 6, 3 |
| r-17 | desert planet with giant worms | 12 | — |
| r-24 | a plague in an algerian town | 103 | 38 |
| r-25 | un orphelin découvre à onze ans qu'il est sorcier et entre dans une école de magie | 10 | 106, 112, 107, 104, 109 |
| r-26 | une famille chassée de sa ferme par la poussière part chercher du travail en Californie | 55 | 112, 105, 114, 120, 108 |
| r-27 | un jeune Soudanais rentre de Londres dans son village au bord du Nil | 93 | 106, 109, 104, 107, 102 |
| r-28 | trois Palestiniens cachés dans la citerne d'un camion pour traverser le désert | 94 | 112, 107, 105, 114, 102 |
| r-29 | عائلة نبيلة تتولى حكم كوكب صحراوي ينتج أثمن مادة في الكون | 12 | 99 |
| r-30 | وباء يجتاح مدينة وهران فيختار طبيب أن يقاومه | 103 | — |
| r-31 | فتاة يهودية تكتب يومياتها وهي مختبئة مع عائلتها في أمستردام | 67 | 95 |
| r-32 | طيار يسقط في الصحراء ويلتقي بصبي صغير جاء من كوكب آخر | 104 | 99, 93, 90 |
| r-35 | a spider spells out messages to save a pig from slaughter | 80 | 35, 40, 15, 116, 89 |
| r-39 | Camus novel where a man kills someone on a beach near Algiers | 102 | 74, 96, 10, 59, 115 |
| r-42 | Mahfouz novel about a young woman in a Cairo alley dreaming of escaping poverty during the war | 90 | 2, 42, 26, 74, 38 |

</details>
