### autofill — mock (mock-small), inprocess, lookup fixture

| cases | exact strict / lenient | title | author | year | genres strict / lenient | synopsis | EN / FR / AR exact | lookup hits | model right/filled: author · year · synopsis · genres | fallback | cost / case | total p50 / p95 | model p95 |
| ---: | --- | ---: | ---: | ---: | --- | ---: | --- | ---: | --- | ---: | ---: | --- | ---: |
| 24 | 33.3 % / 33.3 % | 100.0 % | 95.8 % | 79.2 % | 33.3 % / 37.5 % | 83.3 % | 50.0 % / 0.0 % / 0.0 % | 91.7 % | 0/0 · 0/0 · 0/0 · 7/17 | 0.0 % | $0.00000 | 1 / 2 ms | 1 ms |

Year second opinion: 0 of 4 wrong Open Library years flagged (0 with the right year) · 0 false flags on 18 right years.

Total $0.00000 · 23 model calls · mean 1231 input / 36 output tokens · 0 errors · 0 throttle retries (429, quota)

<details><summary>Misses</summary>

| case | input | wrong fields | got (source) |
| --- | --- | --- | --- |
| i-02 | 9780553103540 | genres | genres: [2,1] (model) |
| i-04 | 9780804139021 | genres | genres: [2,4,1] (model) |
| i-05 | 9781400078776 | genres | genres: [2,12,8] (model) |
| i-06 | 9780141439600 | year, genres | year: 1800 (lookup); genres: [6,12,7] (model) |
| i-07 | 9780441172719 | genres | genres: [2,1,8] (model) |
| t-01 | The Master and Margarita / Mikhail Bulgakov | genres, synopsis | genres: null (empty); synopsis: null (empty) |
| t-04 | Gödel, Escher, Bach / Douglas Hofstadter | genres | genres: null (empty) |
| t-07 | Cat's Cradle | genres | genres: [2,1,7] (model) |
| f-01 | Le Rouge et le Noir / Stendhal | genres | genres: [7,3] (model) |
| f-02 | L'Écume des jours / Boris Vian | year, genres | year: 1963 (lookup); genres: [2,1,5] (model) |
| f-03 | Les Trois Mousquetaires / Alexandre Dumas | genres | genres: [6,12] (model) |
| f-04 | Le Petit Nicolas / René Goscinny | author, genres | author: "Jean-Jacques Sempé" (lookup); genres: [7,12] (model) |
| a-01 | بين القصرين / نجيب محفوظ | year, genres | year: 1960 (lookup); genres: null (empty) |
| a-02 | اللص والكلاب / نجيب محفوظ | genres, synopsis | genres: null (empty); synopsis: null (empty) |
| a-03 | الخبز الحافي / محمد شكري | year, genres, synopsis | year: null (empty); genres: null (empty); synopsis: null (empty) |
| a-04 | يوميات نائب في الأرياف / توفيق الحكيم | year, genres, synopsis | year: 1988 (lookup); genres: null (empty); synopsis: null (empty) |

</details>
