### retrieval — GET /books (trigram + ILIKE), http

| cases | recall@5 (real) | title/author | description | cross-lingual | paraphrase | near-duplicate | nonsense (empty) | p50 | p95 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 49 | 46.5 % | 94.7 % | 40.0 % | 0.0 % | 0.0 % | 0.0 % | 100.0 % | 19 ms | 29 ms |

<details><summary>Misses</summary>

| case | query | expected | top 5 |
| --- | --- | --- | --- |
| r-14 | the little prince | 104 | — |
| r-15 | a boy wizard at a school of magic | 10 | — |
| r-17 | desert planet with giant worms | 12 | — |
| r-24 | a plague in an algerian town | 103 | — |
| r-25 | un orphelin découvre à onze ans qu'il est sorcier et entre dans une école de magie | 10 | — |
| r-26 | une famille chassée de sa ferme par la poussière part chercher du travail en Californie | 55 | — |
| r-27 | un jeune Soudanais rentre de Londres dans son village au bord du Nil | 93 | — |
| r-28 | trois Palestiniens cachés dans la citerne d'un camion pour traverser le désert | 94 | — |
| r-29 | عائلة نبيلة تتولى حكم كوكب صحراوي ينتج أثمن مادة في الكون | 12 | — |
| r-30 | وباء يجتاح مدينة وهران فيختار طبيب أن يقاومه | 103 | — |
| r-31 | فتاة يهودية تكتب يومياتها وهي مختبئة مع عائلتها في أمستردام | 67 | — |
| r-32 | طيار يسقط في الصحراء ويلتقي بصبي صغير جاء من كوكب آخر | 104 | — |
| r-33 | a fireman whose job is burning books begins hiding them instead | 18 | — |
| r-34 | a scientist builds a creature out of corpses and then abandons it | 24 | — |
| r-35 | a spider spells out messages to save a pig from slaughter | 80 | — |
| r-36 | a journalist exposes a fraudulent blood-testing startup | 66 | — |
| r-37 | a woman forced to bear children for a commander in a religious dictatorship | 25 | — |
| r-38 | Austen novel where a woman meets again the naval officer she was persuaded to refuse years ago | 40 | — |
| r-39 | Camus novel where a man kills someone on a beach near Algiers | 102 | — |
| r-40 | the Tolkien book where a hobbit inherits a ring of terrible power | 2 | — |
| r-41 | a future where people are grown in bottles and kept content with drugs | 17 | — |
| r-42 | Mahfouz novel about a young woman in a Cairo alley dreaming of escaping poverty during the war | 90 | — |
| r-43 | a boy studying magic on an island archipelago who unleashes a shadow | 3 | — |

</details>
