### Retrieval: lexical vs hybrid vs hybrid + rerank — mock-embedding, rerank mock-small

| variant | recall@5 (real) | title/author | description | cross-lingual | paraphrase | near-duplicate | nonsense (empty) | hit@1 | MRR@5 | cost / query | p50 | p95 | fallbacks |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| lexical | 46.5 % | 94.7 % | 40.0 % | 0.0 % | 0.0 % | 0.0 % | 100.0 % | 46.5 % | 0.465 | $0.00000 | 19 ms | 29 ms | 0 |
| hybrid (RRF k = 60) | 65.1 % | 94.7 % | 40.0 % | 0.0 % | 80.0 % | 66.7 % | 100.0 % | 65.1 % | 0.651 | $0.00000 | 22 ms | 33 ms | 0 |
| hybrid + rerank | 67.4 % | 94.7 % | 40.0 % | 0.0 % | 100.0 % | 66.7 % | 100.0 % | 67.4 % | 0.674 | $0.00000 | 23 ms | 45 ms | 0 |

Rerank adds +2.3 points recall@5 over hybrid (title/author +0.0, description +0.0, cross-lingual +0.0, paraphrase +20.0, near-duplicate +0.0, nonsense +0.0), +2.3 points hit@1 and 0.023 MRR@5, for $0.00000 per query and 12 ms at p95.

The lexical misses, and which variant finds them:

| case | query | hybrid | hybrid + rerank |
| --- | --- | --- | --- |
| r-14 | the little prince | no | no |
| r-15 | a boy wizard at a school of magic | no | no |
| r-17 | desert planet with giant worms | no | no |
| r-24 | a plague in an algerian town | no | no |
| r-25 | un orphelin découvre à onze ans qu'il est sorcier et entre dans une école de magie | no | no |
| r-26 | une famille chassée de sa ferme par la poussière part chercher du travail en Californie | no | no |
| r-27 | un jeune Soudanais rentre de Londres dans son village au bord du Nil | no | no |
| r-28 | trois Palestiniens cachés dans la citerne d'un camion pour traverser le désert | no | no |
| r-29 | عائلة نبيلة تتولى حكم كوكب صحراوي ينتج أثمن مادة في الكون | no | no |
| r-30 | وباء يجتاح مدينة وهران فيختار طبيب أن يقاومه | no | no |
| r-31 | فتاة يهودية تكتب يومياتها وهي مختبئة مع عائلتها في أمستردام | no | no |
| r-32 | طيار يسقط في الصحراء ويلتقي بصبي صغير جاء من كوكب آخر | no | no |
| r-33 | a fireman whose job is burning books begins hiding them instead | yes | yes |
| r-34 | a scientist builds a creature out of corpses and then abandons it | yes | yes |
| r-35 | a spider spells out messages to save a pig from slaughter | no | yes |
| r-36 | a journalist exposes a fraudulent blood-testing startup | yes | yes |
| r-37 | a woman forced to bear children for a commander in a religious dictatorship | yes | yes |
| r-38 | Austen novel where a woman meets again the naval officer she was persuaded to refuse years ago | yes | yes |
| r-39 | Camus novel where a man kills someone on a beach near Algiers | no | no |
| r-40 | the Tolkien book where a hobbit inherits a ring of terrible power | yes | yes |
| r-41 | a future where people are grown in bottles and kept content with drugs | yes | yes |
| r-42 | Mahfouz novel about a young woman in a Cairo alley dreaming of escaping poverty during the war | no | no |
| r-43 | a boy studying magic on an island archipelago who unleashes a shadow | yes | yes |

Rerank throttle retries (Bedrock quota, retried, not counted as quality): 0.
