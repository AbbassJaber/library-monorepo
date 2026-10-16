# ADR 0003 — Typo-tolerant search: forcing the trigram index path

**Status:** accepted (2026-10-01, Phase 5)

## Context

`GET /books?q=` matches title/author with `ILIKE '%q%'` (substrings) and pg_trgm's `<%`
word-similarity operator (misspellings, threshold 0.45 so "Tolkein" finds "Tolkien" at 0.5).
Both operators are served by the two GIN trigram indexes (`books_title_idx`, `books_author_idx`).

Measured on a 30 000-row corpus of distinct pseudo-word titles (`library_test`, 2026-10-01):

| Path                                        | Planner cost | Actual     |
| ------------------------------------------- | ------------ | ---------- |
| Sequential scan (planner's choice)          | ~1 000       | 244–274 ms |
| GIN bitmap scans (4 index scans + BitmapOr) | ~6 000       | 18–22 ms   |

Postgres' `gincostestimate` prices each trigram index scan at ~1 400, so the planner picks the
sequential scan at every table size tried (120, 1k, 5k, 30k rows) although the index path is
12–30× faster. `random_page_cost` tuning does not change it (the cost is in the index scan
estimate, not the heap fetch).

## Decision

1. The trigram predicate is evaluated in a `MATERIALIZED` CTE that carries no other predicate,
   so the only access paths inside it are the GIN indexes; status/genre/year filters are applied
   after the join (`books.search.ts`).
2. For `q` queries the search transaction runs `SET LOCAL enable_seqscan = off` together with
   `SET LOCAL pg_trgm.word_similarity_threshold = 0.45`. Both settings end with the transaction.
3. A test (`uses the trigram GIN indexes for a q query (EXPLAIN)`) pins the plan: both
   `Bitmap Index Scan on books_title_idx` and `… books_author_idx`, no `Seq Scan on books`.

## Consequences

- At the seeded size (120 rows) both paths take ~3 ms; the decision matters from a few
  thousand rows upward.
- If a future Postgres release fixes the GIN estimate, drop the `enable_seqscan` line and keep
  the test as the guard.
- Ordering: `q` without `sort` orders by `GREATEST(word_similarity(q, title), word_similarity(q, author))`,
  then `createdAt DESC, id DESC`; explicit sorts ignore the score.

## Narrower alternatives tried (2026-10-01, same 30k corpus, time-boxed)

| Setting                                                 | Planner choice | Actual       | Note                                                                                                                       |
| ------------------------------------------------------- | -------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `pg_trgm.word_similarity_threshold = 0.45`              | Seq Scan       | 248 ms       | baseline                                                                                                                   |
| `pg_trgm.word_similarity_threshold = 0.55`              | Seq Scan       | 245 ms       | and loses the typo case: "tolkein" no longer matches Tolkien (score 0.5 < 0.55)                                            |
| `pg_trgm.word_similarity_threshold = 0.7`               | Seq Scan       | 247 ms       | same                                                                                                                       |
| `gin_fuzzy_search_limit = 100` / `1000`                 | Seq Scan       | 248 / 242 ms | the limit only caps rows _returned by a GIN scan_; it does not enter the cost model, so the planner still avoids the index |
| `gin_fuzzy_search_limit = 100` + `enable_seqscan = off` | GIN bitmap     | 17.6 ms      | the limit changes nothing once the index path is taken (matches are few anyway)                                            |

The threshold does not enter `gincostestimate` either (selectivity of `<%` is a fixed
default), so neither knob moves the planner. Raising the threshold would also throw away the
feature's purpose (typo tolerance). `enable_seqscan = off`, scoped to the search transaction,
remains the only setting that makes the planner take the measured-faster path.

Reminder: at the seeded ~120 rows a sequential scan **is** the correct plan (both paths ≈ 3 ms);
the override only pays past a few thousand rows and costs nothing below that.
