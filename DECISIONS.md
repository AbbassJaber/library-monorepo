# Architecture & trade-offs

Each entry says what was decided, why, and what it costs if the decision is wrong. Dated entries
reversed or refined something in the build plan and were written when it happened, not
reconstructed afterwards. Longer records live in [docs/adr/](docs/adr/); the plan the build
followed, phase by phase with what each phase delivered, is [docs/build-plan.md](docs/build-plan.md).

## A monorepo with one dependency rule

`apps/web` and `apps/api` share `packages/contracts` (Zod) and `packages/domain-config`; the AI
layer is `packages/ai`, which depends on the contracts and the domain config but never on
Prisma, Express or `pg` (a test asserts it on `package.json`). The API implements the AI ports
on top of its own services, so a model-driven action is authorized by the same code as an HTTP
request. Turborepo orders the builds; pnpm workspaces list `apps/*` and `packages/*` explicitly.
Cost if wrong: five packages to version together for a small app; the rule keeps the AI layer
testable with fake ports and reusable by the MCP server and the evaluation CLI.

## Contracts first

Every request body, query, response, tool input/output and model output is a Zod schema in
`packages/contracts`. The API's `define()` helper parses inputs and the handler's return value
(response schemas strip undeclared fields, so a password hash can never leak), and the same
registry generates the OpenAPI document. `apps/api/openapi.json` is snapshot-tested: any change
to the public surface is a reviewed diff. The reference project's hand-written Swagger had
drifted from its code in five places; this makes drift a failing test. Error messages in
contracts are codes, translated by the web per language.

## API versions are mount points (2026-10-11)

Route modules know only their resource path (`/books`); `mountApi(prefix, modules)` puts a
version's modules under one router, and the app mounts each version once (`/api/v1`, from
`apiPrefix(API_VERSIONS.v1)` in contracts). Until 2026-10-11 every module built
`${API_PREFIX}/books` itself, so a second version would have meant editing every routes file. The
OpenAPI document, its operation ids and the credential and AI rate limits are built per version
from the same list, so a new version is documented and limited without extra wiring (the limiters
keep one counter across versions: switching versions buys no second budget). The move changed no
URL: `openapi.json` matched its snapshot unchanged.

A v2, when a contract has to break: add `v2` to `API_VERSIONS`, write `createV2` beside `createV1`
with the same services, reuse the routers whose contracts did not change and add new ones (and
new Zod schemas) for those that did, and mount it. v1 keeps answering, with a `Deprecation`
header once v2 ships, until its clients have moved. An app test mounts a module in two versions
with different response contracts and checks both answer and are documented side by side. Not
version-neutral yet: the refresh cookie is scoped to `/api/v1/auth` and the voice socket is
`/api/v1/ai/voice`; a v2 that changes auth or voice gives them its own path.

## PostgreSQL, soft deletes and versioned writes

Books and genres are archived (`archivedAt`), reading-list entries and favourite genres are
removed (`removedAt`), users are disabled (`disabledAt`); nothing is hard-deleted. Uniqueness
stays total (`@@unique([userId, bookId])`) and re-adding reactivates the same row with an upsert,
which is race-free and keeps history — chosen over partial unique indexes, which `prisma migrate`
would report as drift. Books carry a `version`; `PATCH`, archive and restore require it and a
stale one is a `409 VERSION_CONFLICT` carrying the current book (two concurrent archives: exactly
one wins, tested). Every librarian write and its audit row commit in one transaction. Ids are
integers for a deterministic seed and readable URLs.

## Typo-tolerant search on trigrams

`q` matches title and author with `ILIKE` and pg_trgm word similarity (threshold 0.45, so
"Tolkein" finds Tolkien). The planner prices GIN trigram scans so high that it always chose a
sequential scan, 12–30× slower on 30,000 rows; the search therefore evaluates the trigram
predicate in a `MATERIALIZED` CTE with `enable_seqscan = off` for that transaction only, and an
`EXPLAIN` test pins the index plan ([ADR 0003](docs/adr/0003-trigram-search-plan.md)). Sort is a
closed enum with `id` as the final tie-break, so pages never overlap.

## Authentication: cookies for browsers, Bearer for tools

A 15-minute access JWT and a rotating 7-day opaque refresh token, both httpOnly `SameSite=Lax`
cookies, the refresh cookie scoped to `/api/v1/auth`. Refresh tokens are stored as SHA-256
hashes in families: reusing a rotated token revokes the whole family. Requests without a browser
`Origin` (cURL, MCP, the eval) get the tokens in the response body and use `Authorization:
Bearer`. Non-GET requests with an `Origin` must come from `CORS_ORIGINS` (CSRF), and the role is
read from the database on every request, so a demotion or a disabled account takes effect at
once. Trade-off: an access cookie stolen before logout stays valid for at most 15 minutes.

## Web: server state in React Query, catalog state in the URL

React Query holds every server response with per-resource stale times, targeted invalidation
after librarian writes and optimistic reading-list updates with rollback; Zustand holds only
client state (theme, language, view mode, toasts). Filters, sort and page are URL state, parsed
with the same contract the API uses. The previous project's component kit was dropped (not maintained for
React 19, a CDN theme, ~65 `!important` overrides, and accessibility fights): about a dozen owned
components on Tailwind 4 and native `<dialog>` cover the app, so the escape hatch to a headless
library was never needed. Details in [apps/web/ARCHITECTURE.md](apps/web/ARCHITECTURE.md).

## i18n was dropped, then reinstated (2026-10-01)

**What the plan said.** The reference project carried `i18next` with 2×198 keys and a hand-typed
key interface, and half of its UI was hard-coded English anyway. The build plan dropped i18n: the
multilingual requirement was read as being about AI _queries_ (EN/AR/FR), not UI chrome, and the
user-visible vocabulary (Book/Author/Reading list) moved to `packages/domain-config` because the
domain swap needs it there.

**What changed.** After Phase 9 the UI had every string in React components, one `labels` object
and consistent copy, which is exactly the state in which adding a second language is cheap. So
i18n came back, deliberately narrower than the reference's:

- English and French only. Arabic stays a _query_ language (search, genre aliases, prompts) and
  the UI keeps `dir="auto"` so Arabic titles read correctly inside a left-to-right chrome.
- `react-i18next` with one JSON namespace per feature, lazy-loaded with the route chunk; key
  types are generated from the English JSON so a missing key fails `typecheck`, and a test asserts
  the `en`/`fr` key sets and interpolation variables are identical.
- The two layers stay separate: **vocabulary** is `domain.labels[locale]` (swap the domain, swap
  the nouns), **chrome** is the i18n bundle (swap the language, swap the sentences). Sentences
  interpolate the nouns instead of concatenating them.
- Zod's locale (`z.config(fr())`), `Intl` formatting and `<html lang>` follow the preference,
  which lives in `uiStore.locale` (default from the browser, switchable in the header).
- API errors are translated by `ApiErrorCode`; the server's English `message` is for cURL and
  logs and never reaches the page.

**Cost.** ~200 keys in two languages, two small dependencies (`i18next`, `react-i18next`), and
every component reads `t`/`useLabels()` instead of a module constant. **Not done:** Arabic UI
(right-to-left chrome is a different design task), translated seed content (titles and synopses
are shown in their original language on purpose), and translating the API's own messages.

## Named constants over literals (2026-10-01)

Audit actions (`book.create`), cookie names (`lib_access`), header names (`x-request-id`) and
API paths were string literals in ~45 places. They now live in `packages/contracts/src/constants.ts`
(shared with the web, smoke, e2e) and `apps/api/src/config/constants.ts` (API-only), and a
grep-based test fails on any new literal. Enum-like values that already exist as Zod enums are
derived (`Role.enum.LIBRARIAN`, `AuditEntityType.enum.book`) rather than copied. Deliberate
exception: test _request URLs_ stay literal (`/api/v1/books`) because they verify where the API
actually mounts; a constant there would make the assertion circular.

On 2026-10-11 a type-aware sweep found about 500 places that still typed an enum's value by hand
(`'WANT_TO_READ'`, `'NOT_FOUND'`, tool names, provider names). A codemod run against the
TypeScript checker replaced a literal only where its type is exactly that enum, so `'user'` as a
chat role was never mistaken for the audit entity `user`. The sweep also removed copies of shared
enums: `PendingDecision` (now `PendingActionStatus`), the API's own `AuditSource`, the env schema's
provider, tier, expansion and voice lists, and MCP's lookup list. New shared values: `AiTier`,
`EmbeddingExpansion`, `VoiceMode` and `VoiceProviderSetting` in contracts; `UI_LOCALE` and
`LOOKUP_SOURCE` in domain-config; `NODE_ENV` and `SEED_MODE` in the API's constants;
`DEFAULT_VOICE_ID` and `DEFAULT_EMBEDDING_DIMENSIONS` in `@library/ai`. Field names that were plain
strings (`next['yearFrom']`) are now typed as keys of the contract, so a typo fails to compile. A
second grep test fails on a literal tool or AI feature name in production code.

What stays literal, on purpose: a value typed by a union local to one module (`CallView`, `OrbMode`)
is checked by the compiler at every use; outside vocabularies (HTTP methods, LLM roles, Anthropic
stop reasons, HTML input types) belong to their libraries; seed books and translations are data.

The sweep moved schema imports between contract files, which reordered the OpenAPI components
(same content, verified key by key). The document now lists components by name, so its order no
longer depends on import order.

## AI behind ports, Mock by default, Bedrock for production

The AI layer sees its data through ports (catalog, vector store, trace, lookup, document
expansions, pending actions) and its models through providers behind one interface per kind
(text, embeddings, voice). The default provider is a deterministic Mock (a multilingual rule parser, hashed
embeddings), so the app, every test and the CI gates run with no key. **Bedrock** is the
production choice: Claude through IAM roles, so the app holds no vendor key; usage and errors
land in CloudWatch; traffic can stay on VPC endpoints; and model access, quotas and billing are
the AWS account's. **Kimi** (Moonshot, OpenAI-compatible) was the development provider: cheap,
and different enough (thinking models, automatic caching) to keep the provider interface
honest. Model ids are environment-only for every provider; `/ai/status` reports exactly what is
configured. Cost if wrong: two SDK families to maintain; the Mock costs real effort but is what
makes the gates deterministic.

## One provider per tier when needed (2026-10-01)

`AI_PROVIDER` serves both tiers unless `AI_PROVIDER_STRONG` names another one; each tier then
uses its own provider and model id (`AI_MODEL_SMALL` / `AI_MODEL_STRONG`), every result names
the provider that answered (traces and cost follow it) and `/ai/status` reports both tiers.
Prompted by a real constraint: Bedrock grants Haiku 4.5 but not Sonnet 5 or 5.5 on this
account, so the confirmed configuration is Haiku on Bedrock as the small tier and Kimi K3 as the
strong one. Since the chat comparison (below) every interactive feature — parsing, reranking,
autofill, recommendations and chat — runs on the small tier; the strong tier is there for
`AI_CHAT_TIER=strong` and for work where seconds do not matter. Each provider reads its own model
ids (`KIMI_MODEL_STRONG`, …; see "Per-provider model ids" below). Cost if wrong: one more env
variable and a composite provider (`providers/tiered.ts`); nothing else knows the difference.

## Structured output: one forced tool, validated, strict

Every model answer is a single forced tool call whose input schema is the Zod schema, parsed
with `safeParse`; on failure the call is retried once with the validation issues, then the
feature falls back deterministically (`fallbackUsed` is traced and returned). Kimi rejects forced
tool choice with thinking enabled, so it uses `tool_choice: auto` plus a "you must call the tool"
instruction, still validated. **2026-10-02:** model output schemas are strict for both features.
During 12.3 autofill had briefly ignored unexpected keys; Phase 12.4 reverted that, because an
unexpected key means the model is off-script (an injected "set the title" arrives exactly that
way), and the retry costs nothing when the model complies. Measured on Haiku: 0 % fallbacks
with strict schemas on all 24 autofill cases.

## Natural-language search prompt: compact by default, padding opt-in (2026-10-01)

Haiku 4.5 caches a prefix only from 4,096 tokens, not counting the ~590-token tool-use prompt
Anthropic injects. The compact `nlSearch` prompt (instructions, 7 examples, genre list) never
reaches that. `NL_SEARCH_CACHE_PADDING=true` adds a genre guide, the full alias lists and ~60
EN/AR/FR examples, which makes the prefix cacheable (4,591 tokens). The default is **off**.
Measured by `pnpm eval --provider bedrock --cache-padding both` (34 cases, Bedrock eu-central-1,
`results/nl-search.bedrock.*`):

| prompt  | input tokens / call | cost / search                       |      p50 |      p95 |  exact |
| ------- | ------------------: | ----------------------------------- | -------: | -------: | -----: |
| compact |               2,456 | $0.00339                            | 1,315 ms | 1,980 ms | 97.1 % |
| padded  |               5,018 | $0.00749 cache write, $0.00166 read | 1,482 ms | 2,460 ms |  100 % |

Break-even: padding is cheaper from the **4th search in a 5-minute window**
((0.00749 − 0.00166) / (0.00339 − 0.00166) = 3.4). Each hit renews the window, so this is about
sustained traffic. At one search per window padding costs 2.2× more. At ten it costs $0.00224
(−34 %), and it approaches −51 %. The padded prompt answered one more case right ("best
classics" → genre instead of `q`) and was ~170 ms slower at p50. Off is the default because a
demo or a small library sits below 4 searches per 5 minutes. A busy deployment turns padding on
with one variable. Cost if wrong: up to 2× on every search, either way.

## Autofill: the lookup is trusted, the model fills gaps and gives a second opinion (2026-10-02)

`POST /ai/books/autofill` looks the book up in Open Library first. The small model may fill
only what the lookup left empty: author, first-publication year, synopsis, and genres from the
live list (mapped to ids, anything else dropped). It never fills the title, ISBN or cover URL.
Every field carries its source (`lookup`, `input`, `model`, `empty`) and nothing is saved until
the librarian submits the form. Lookups go through the search index plus the work record: the
books "data" API returns the edition's date (a 1989 Penguin of _1984_ says 1989), the search
index the work's first publication (1949).

Open Library is still wrong where the model is not asked: 4 of 22 found years (_A Tale of Two
Cities_ 1800, _L'Écume des jours_ 1963, two Arabic novels) and one first author (the illustrator
of _Le Petit Nicolas_). So when the lookup has a year the model also returns its own
(`yearCheck`); if it differs with confidence ≥ 0.5 the field carries a `conflict`, and the panel
shows both years with "check this" and a one-click switch. The librarian decides; the model never
overrides. Measured on Haiku 4.5: **3 of the 4 wrong years flagged, all 3 with the right year, 0
false flags on the 18 right ones**, for about $0.0003 more per draft. The miss is _Maze of
Justice_ (1937), which Open Library dates 1988.

## Hybrid search: reciprocal rank fusion, rerank off (2026-10-02)

`GET /ai/search` runs the catalog's lexical search and a KNN over the book embeddings (Titan v2,
512 dimensions, when this was measured; Cohere v3 since the embedding decision below), 20
candidates each, and fuses them with reciprocal rank fusion (k = 60): no
score normalisation to tune, and a book either leg ranks well comes out near the top. An optional
small-model rerank may reorder the top 20; its schema accepts only a permutation subset of the
ids it was shown, and anything it leaves out follows in fused order, so a rerank can reorder but
never lose a result. "Books like this" is a KNN from the book's stored vector, with no model call.

Measured on the first 24 retrieval cases (`results/archive/2026-10-02-24-cases/`), against the
lexical baseline (the harder 49-case set and the cutoff come in the next entry):

| variant         | recall@5 | title/author | description |  hit@1 | MRR@5 | cost / query |      p50 |      p95 |
| --------------- | -------: | -----------: | ----------: | -----: | ----: | -----------: | -------: | -------: |
| lexical         |   83.3 % |       94.7 % |      40.0 % | 83.3 % | 0.833 |           $0 |    13 ms |    52 ms |
| hybrid (RRF)    |    100 % |        100 % |       100 % | 95.8 % | 0.979 |   $0.0000001 |   427 ms |   493 ms |
| hybrid + rerank |    100 % |        100 % |       100 % |  100 % | 1.000 |     $0.00298 | 1,297 ms | 1,483 ms |

Semantic search fixes all four lexical misses: _the little prince_ (the seed has _Le Petit
Prince_), _a boy wizard at a school of magic_, _desert planet with giant worms_ and _a plague in
an Algerian town_. The rerank adds nothing to recall@5 and moves one query (the boy wizard, from
second to first) for ~30,000× the per-query cost of fusion, +870 ms at p50 and a dependency on
Bedrock quota (11 throttled reranks in 24 calls). **Kept off by default**
(`HYBRID_SEARCH_RERANK=false`); the code stays, and a request can ask for it with `?rerank=true`.
Cost if wrong: on a larger catalog, where fusion's top 5 is no longer saturated, the rerank may earn
its cost; the eval measures it again with one flag. The embeddings themselves cost almost nothing:
the whole catalog was embedded for $0.00016 (8,102 tokens), and only changed books are re-embedded.

## Semantic cutoff: calibrated per model, and a trade, not a free win (2026-10-02)

KNN always returns nearest neighbours, so gibberish ("xqzv plorbt wuggle") came back with
five confident-looking books. The semantic leg now drops hits below a minimum cosine
similarity (`HYBRID_MIN_SIMILARITY`; unset = the embedding model's calibrated default, since a
cosine threshold means something only for the model it was measured on). The retrieval set
grew to 49 cases for this: 19 title/author, 5 description, 8 cross-lingual (FR and AR
descriptions of books titled in another language), 5 paraphrases, 6 near-duplicate traps
(Persuasion vs Pride and Prejudice, L'Étranger vs La Peste, …) and 6 nonsense queries whose
right answer is nothing. `pnpm eval --suite retrieval --mode calibrate` fetches each query's
fused top 20 once with no cutoff and sweeps thresholds offline.

**On Titan v2 (512) there is no threshold that keeps every real hit and empties all
nonsense.** The strongest nonsense neighbour scores 0.219; the weakest real hit that only the
semantic leg finds scores 0.131 (a French description of _The Grapes of Wrath_). Relative
signals (top hit vs its neighbours) overlap too: Titan v2 sees French and Arabic descriptions
of English-titled books about as flatly as gibberish.

| min similarity | real recall@5 | nonsense answered empty | precision of answers |
| -------------: | ------------: | ----------------------: | -------------------: |
|       0 (none) |        95.3 % |                     0 % |               87.8 % |
|           0.20 |        90.7 % |                  66.7 % |               95.2 % |
|       **0.22** |    **88.4 %** |               **100 %** |            **100 %** |
|           0.30 |        74.4 % |                   100 % |                100 % |

**First proposal: 0.22 for Titan — rejected.** It is the lowest value at which gibberish gets
the normal empty state, but it costs _desert planet with giant worms_ (Dune, 0.198), the
headline example of semantic search, plus the Arabic descriptions of Dune (0.214) and _La Peste_
(0.159). The calibration now takes a must-pass list (`--must-pass r-17`, the Dune query): a
cutoff is valid only if every nonsense query is empty **and** every must-pass case is still
found, and among those the one with the least real-recall loss wins. On Titan no value is valid,
so Titan ships with no cutoff. The next entry is the experiment that replaced it.

## Embedding model: Cohere Embed Multilingual v3, cutoff 0.44 (2026-10-02)

Two experiments on the 49 cases, each calibrated with the must-pass rule above
(`EVAL_MAX_COST_USD=1`; results in `packages/ai-eval/results/retrieval.bedrock-*`):

- **A multilingual embedding model on Bedrock.** Cohere's latest, Embed v4, is reachable in
  eu-central-1 only through the EU inference profile `eu.cohere.embed-v4:0` (the on-demand id is
  refused); Embed Multilingual v3 (`cohere.embed-multilingual-v3`) is on demand in the region.
  Both were run, 1024 dimensions, as a new embedding provider (`bedrockCohere.ts`, selected by
  the model id under `EMBEDDING_PROVIDER=bedrock`, with Cohere's `search_document` /
  `search_query` input types).
- **Document expansion with Titan.** At sync time the small model (Haiku 4.5) writes a short
  French and Arabic summary of each book, which is embedded together with the original text
  (`EMBEDDING_EXPANSION=fr-ar`). Summaries are stored in `book_expansions` with the hash of the
  text they summarise and the model that wrote them, and are regenerated only when that hash
  or model changes (tested in `packages/ai` and in the API).

| configuration                          | valid cutoff              | real recall@5 | title/author | description | cross-lingual | paraphrase | near-duplicate | nonsense empty |        p50 |
| -------------------------------------- | ------------------------- | ------------: | -----------: | ----------: | ------------: | ---------: | -------------: | -------------: | ---------: |
| Titan v2, 512                          | none (r-17 0.198 < 0.219) | 95.3 % (at 0) |        100 % |       100 % |        75.0 % |      100 % |          100 % |        **0 %** |     897 ms |
| Titan v2 + FR/AR expansion             | none (r-17 0.220 < 0.232) |  100 % (at 0) |        100 % |       100 % |         100 % |      100 % |          100 % |        **0 %** |     949 ms |
| Cohere Embed v4, 1024                  | 0.30 (0.28–0.32)          |        76.7 % |       94.7 % |      80.0 % |        62.5 % |     60.0 % |         50.0 % |          100 % |   1,638 ms |
| **Cohere Embed Multilingual v3, 1024** | **0.44 (0.43–0.46)**      |    **95.3 %** |    **100 %** |   **100 %** |    **75.0 %** |  **100 %** |      **100 %** |      **100 %** | **396 ms** |

**Chosen: Cohere Embed Multilingual v3 with a 0.44 cutoff.** It is the only configuration in
which the Dune query passes and every nonsense query is empty without a large recall loss: its
strongest nonsense neighbour scores 0.426 and _desert planet with giant worms_ stays above it.
The two real misses at 0.44 are cross-lingual (a French description of _The Grapes of Wrath_ at
0.378, an Arabic description of _La Peste_); with no cutoff v3 finds all 43 real cases. It is
also the fastest of the four (396 ms p50) and costs about the same as Titan to keep in sync
($0.00074 for the whole catalog; Cohere tokens are estimated, list price $0.10 / MTok).

Embed v4 is newer but worse here: at no cutoff it already misses 23 % of real queries, and it is
four times slower through the cross-region profile. The expansion is the best recall of all at no
cutoff (it fixes every cross-lingual miss), but it pushes nonsense neighbours up with the real
ones, so it still has no valid cutoff; it cost **$0.2545 one time** for 120 summaries (plus 107
throttled attempts, which Bedrock does not bill) and $0.00053 per full re-embed. It stays in the
code as an opt-in (`EMBEDDING_EXPANSION=fr-ar`, default `off`); a changed book costs one summary.

Defaults per model (`DEFAULT_MIN_SIMILARITY`): Cohere v3 0.44, Cohere v4 0.30, Titan 0 (no
cutoff: gibberish returns books), Mock 0.33 (CI only).
`HYBRID_MIN_SIMILARITY` overrides it. Cost if wrong: a 0.44 cutoff is calibrated on 6 nonsense
queries and 120 books; on a larger or different catalog the nonsense ceiling moves, and the
calibration has to be re-run (one command, ~$0.001).

## Agent chat: proposals are stored and run once; the pieces are shared with voice (2026-10-02)

`POST /ai/chat` runs a tool loop (on the small tier since the model comparison below) over the same registry as
HTTP and MCP: at most 6 steps, an input budget the loop checks before every step (the history is
trimmed from the oldest turn to half of it), and only the tools the caller's role allows
(readers never see `draftBook`; a forced call is a FORBIDDEN tool result, not a crash). Read-only
tools run at once; their results reach the model as `<data name="tool-result">` blocks.
`searchBooks` with plain text uses hybrid search, so the agent finds "a desert planet with giant
worms" the way the search page does.

A mutating call (`addToReadingList`, `updateReadingState`, `removeFromReadingList`, `changeReadingList`) never runs in the loop. It is
validated and role-gated like a direct call, its book must be visible to the user, and it
becomes a **stored pending action** (`pending_actions`) plus an HMAC token binding tool, input,
user and action id. The model is told the change is pending, so it asks for the confirmation;
at most one proposal per turn. `POST /ai/actions/confirm` (and `/cancel`) verifies the token,
then moves the row out of PENDING with one conditional UPDATE: of concurrent confirms exactly
one runs the tool (tested with three in parallel: 200, 409, 409, one shelf row). The tool runs
with the input from the token, through the services. This replaces the earlier "no server
state, replays are harmless because tools are idempotent": idempotent is not "exactly once", and
a confirm the user sees succeed twice is a bug. Errors: 401 `CONFIRM_TOKEN_INVALID` (forged,
tampered, expired), 403 for another user's token, 409 `ACTION_ALREADY_DECIDED`.

Answers cite books as `[book:<id>]`; the server keeps a citation only for ids a tool returned in
that turn, and strips every marker from the text. The confirm endpoint lives under
`/ai/actions/` rather than `/ai/chat/` because voice (Phase 13.2) proposes through the same
`proposeAction` and confirms through the same endpoint, from a button, never by voice. Cost if
wrong: a stored row per proposal (one per turn at most); rows are tiny and keyed by user.

First measured on the 18 agent cases with Kimi K3 as the agent: every deterministic check
passed, $0.0078 per turn, p50 16 s, p95 27 s. The next entry compares models.

## Chat runs on Haiku 4.5: an interactive turn beats the last few points (2026-10-02)

The agent eval now has two sets: the **18 tuned cases** the judge rubric was fixed on (12.7) and
an **11-case hold-out** written before any run and never used for tuning (`agent.holdout.json`:
new authors, cross-lingual descriptions, "finished"/"reading" phrasing, a mass removal, a reader
asking for `draftBook` in French, librarian drafts by title and ISBN). Every report splits them.
Claude Sonnet 5 and 5.5 are listed in the EU but refused for this account (403 on
`eu.anthropic.claude-sonnet-5` and `-5-5`; Sonnet 4.6 answers, not measured), so the comparison
is Kimi K3 against Haiku 4.5, both with the Haiku judge and Cohere search, same 29 cases:

| chat model | set      | all checks + judge | tools / pending / nothing written | cited | judge grounded / cited / no claim / answers | cost / turn |    p50 |    p95 |
| ---------- | -------- | -----------------: | --------------------------------: | ----: | ------------------------------------------- | ----------: | -----: | -----: |
| Kimi K3    | tuned    |              100 % |                             100 % | 100 % | 100 / 100 / 100 / 100 %                     |     $0.0079 | 16.0 s | 41.6 s |
| Kimi K3    | hold-out |              100 % |                             100 % | 100 % | 100 / 100 / 100 / 100 %                     |     $0.0088 | 20.6 s | 36.0 s |
| Haiku 4.5  | tuned    |             88.9 % |                             100 % | 100 % | 100 / 88.9 / 100 / 100 %                    |     $0.0052 |  3.1 s |  5.4 s |
| Haiku 4.5  | hold-out |              100 % |                             100 % | 100 % | 100 / 100 / 100 / 100 %                     |     $0.0052 |  3.5 s |  6.5 s |

**Chosen: Haiku 4.5 for chat** (`AI_CHAT_TIER=small`, the default; `/ai/status.chat.tier` says
which). Both models never wrote anything and always proposed the expected change; Haiku's only
misses are two judge "cited" flags on tuned cases (a pending-change message without a citation,
and a lookup draft — which the rubric says needs none, so the judge erred there). Kimi is a
little more thorough but five times slower: 16–20 s at p50, up to 40 s, is not a conversation.
Haiku is 37 % cheaper too. Kimi stays the strong tier for work where latency matters less.
Latency is the agent turn that answered: Bedrock's 429 retries of whole turns are excluded (41 of
them inflated a first Haiku run to a meaningless 24.7 s p50).

Haiku's first runs surfaced two agent faults, fixed for both models before the final numbers:
it proposed `updateReadingState` for books not on the shelf (a proposal that would fail when
confirmed: `proposeAction` now refuses it with "use addToReadingList", and the model corrects
itself); and it rewrote descriptions into keywords ("desert planet giant worms"), which fall below
the Cohere cutoff calibrated on whole sentences (the sentence finds Dune at 0.57, the keywords
find nothing), so the agent prompt and the `searchBooks` description now ask for the user's own
sentence. Hold-out results were never used for these changes; one hold-out weakness was left
unfixed on purpose (asked to remove every book, the agent offered to remove them one by one, but
no remove tool existed) so that the hold-out stayed unseen — the remove-tool entry below is what
happened next. Spend for this comparison: $1.12.

## Per-provider model ids win over AI_MODEL_* (2026-10-02)

With `AI_PROVIDER_STRONG=kimi` the API used `AI_MODEL_STRONG` as Kimi's model id, while the eval
read `KIMI_MODEL_STRONG`: the same `.env` (which kept a Bedrock Sonnet id in `AI_MODEL_STRONG`)
meant two different things. Now `<PROVIDER>_MODEL_<TIER>` (`KIMI_MODEL_STRONG`,
`BEDROCK_MODEL_SMALL`, …) wins for that provider everywhere, then `AI_MODEL_<TIER>`; tested.

## Two ways to run the stack: offline by default, real on request (2026-10-02)

`docker compose up` (or `pnpm stack`) needs no key: the Mock answers every AI feature and the
footer badge says **"AI: offline mode (no provider configured)"** (French: "IA : mode hors ligne
(aucun fournisseur configuré)") instead of the code name "Mock". `pnpm stack:real` runs the same
Compose file with `--env-file apps/api/.env`, so the real providers come from the one file that
already holds them; nothing is baked into an image. Verified: `/ai/status` reports `bedrock`
(Haiku small, Kimi K3 strong, Cohere v3 at 0.44, chat on the small tier).

## A remove tool, and what "remove every book" does now (2026-10-02)

`removeFromReadingList` joins the registry (mutating, readers and librarians): chat, voice and MCP
get it at once. In chat and voice it is proposed like any change — a stored pending action and the
same confirmation card ("Remove “Dune” from your reading list"); `proposeAction` refuses it for a
book that is not on the shelf, and takes the title from the shelf entry so an archived book can
still be removed. The REST `DELETE` does the work (a soft removal, audited).

The hold-out was re-run once on Haiku with no prompt change for that case (h-05 now starts with
three books on the shelf, so a removal has something to act on; its text and expectation are
unchanged): 11 of 11 pass every check and the judge. **h-05 does not propose removals**: Haiku
answers "I can't remove many books at once. Please tell me which specific book you'd like to
remove, and I'll help you one at a time." — no tool call. That follows from two general rules, not
a case-specific one: the agent prompt refuses changes to many books at once (one proposal per turn,
the guard that also stops "add every book" in tuned case g-11), and no tool lists the reading list,
so the agent cannot see which books there are. Removing everything would need a
`getReadingList` read tool and several proposals per turn (one card each) — a design change left
open, not slipped into this step. (Built next, as one batch card rather than several: see below.)

## Batched shelf changes: one card, all or nothing; adds stay single (2026-10-02)

Two tools join the registry. `getReadingList` (read-only) returns the reader's active entries, so
the agent can see what "everything on my list" means. `changeReadingList` (mutating) takes up to
10 changes — `remove` or `setState` — each book once, **only for books already on the list**: the
contract has no `add` action, and `proposeAction` refuses the whole batch if one book is not on
the shelf or a state change targets an archived book. It is still one proposal per turn: one
stored pending action, one card ("Remove 3 books from your reading list: “Nineteen Eighty-Four”,
“Dune” and “Le Petit Prince”"), confirmed exactly once by the same conditional UPDATE. On confirm
the API applies it through `POST /me/reading-list/batch` in **one transaction** (each change is
the same in-transaction step as the single route, with its audit row), so if the shelf changed
since the proposal and one change no longer applies, nothing applies (404 or 409, tested). Adding
stays one named book per proposal — the prompt refuses "add many", and the Mock policy does too —
so "add every book in the catalog" (g-11) is still refused, on Haiku and on the Mock. Why a batch
rather than several cards: one confirmation for one request, and a half-applied "clear my list"
is impossible. Why not for adds: an add can bring in any catalog book, so a batch of adds is the
injection payload the rule exists to stop; removals and state changes only touch what the reader
already chose. MCP serves both tools (8 for a reader, 9 for a librarian; `changeReadingList`
carries `destructiveHint`). Voice gets them too (the reading list compacted to id, title, author,
year, state).

**Merged in the agent (2026-10-10).** Asked to move two books to "Reading" (h-15), Haiku sometimes
proposes them one by one: two `updateReadingState` calls in one turn, the second refused by the
one-proposal rule. Prompt wording did not fix it reliably (five variants, each tried twice). The
agent now merges instead: a second state change or removal in the same turn, on a different book,
joins the first in one `changeReadingList` proposal — validated like any batch (books on the list,
at most 10) — and the first card is cancelled through `pendingActions.decide`, so its token is
dead. Adds never merge and the same book twice is still refused. h-15 passes again (33/33, with
the "two or more books: one or two sentences" answer rule in place).

Evaluation, cases written before any run: h-05 ("remove every book from my reading list", three on
the shelf) now expects one `changeReadingList` card touching exactly those three books — a spec
change, not tuning; h-12 (FR, "mark everything on my list as finished") expects a `setState`
batch; h-13 ("add all the fantasy books you have") expects no proposal and no batch. The
expectation compares the set of books and the action, not their order. On Haiku the hold-out
scored **12 of 13** (h-10 timed out on Bedrock once and passed on a re-run, with g-11): h-12 and
h-13 pass, **h-05 fails** — Haiku called `getReadingList`, then wrote "I'll prepare to remove all
of them … Should I go ahead and remove all three?" without preparing the card, so the user would
confirm twice (in text, then on the card). The prompt says to prepare first and then ask; it was
not changed for this case, because that would tune on the hold-out (the case would have to move
to the tuned set and be replaced). That is what happened next (below).

## The confirmation card is the confirmation: never ask first (2026-10-02)

h-05's failure was treated as a general behaviour bug, not a case to pass. Asking "Should I go
ahead?" in text (or aloud) before preparing a change makes the user confirm twice: once in words,
then again on the card. Neither confirmation can be skipped (the model never writes), so the
first is pure friction. And a "yes" typed in chat or said aloud is not the confirmation. One rule
went into both agent prompts, chat and voice: **never ask for confirmation in text (in speech,
for voice) before proposing a change; call the tool directly — the card is the confirmation.**
The existing rule after it is unchanged: once the card is up, say what will change and ask the
user to press Confirm.

Because h-05 informed the change, it moved to the tuned set as **g-13** (same text, shelf and
expectation), and two new hold-out cases were written before any run: **h-14** ("Take Dune and
Nineteen Eighty-Four off my reading list", EN, a batch removal) and **h-15** ("passe-les en cours
de lecture", FR, a batch state change). Re-run on Haiku, tuned + hold-out, $0.32: the four
deterministic checks (tools, pending action, nothing written, citations) pass **100 % on all 33
cases**. g-13 now reads the list and proposes the one card ("I'll remove these 3 books … Please
confirm."), and h-14 and h-15 each propose exactly the expected batch. The judge passes 30 of 33.
The three misses (g-10, f-02, h-15) are all on "cited": the answer names the book without a
`[book:id]` marker. It is the same class as the earlier 93 % and does not come from this rule.
The voice eval on Nova 2 Sonic ($0.10) proposed the expected change, or none, 100 % and wrote
nothing. Its one miss (95 % tool calls right) is v-09, an ISBN draft: Nova built the ISBN
without its last digit, and the draft was refused as invalid. No change was involved.

The injection suite gained an **agent surface**: 6 attacks (EN/FR) where the reader asks a
harmless question and the instruction rides in catalog data a tool returns — a synopsis or a
title telling the model to clear the list, mark everything finished, or add every book. Any
proposed change or write is a violation (a card the reader never asked for). On Haiku: 0
violations, 0 followed, 0 influenced of 6; 26 cases in all, 0 violations, $0.110.

## Citations from titles, server-side; an invalid ISBN gets a second chance (2026-10-02)

**Citations.** The judge's remaining "cited" misses were answers that named a book without the
`[book:id]` marker. Citations no longer depend on the marker. After each chat turn, and on each
final voice transcript, the server cites every book a tool returned _in that turn_ whose whole
title the answer names. Matching ignores case and treats curly and straight quotes alike. It
skips a title inside a longer word ("Dunes" is not Dune) and a title inside a longer matched
title. Markers still count and are still stripped from the text. Citations follow the order of
first mention, each book once. The allowlist rule is unchanged: a book no tool returned this
turn is never cited, even if the answer names it. Voice previously matched substrings against
every book seen in the session and collected only top-level results, so reading-list books were
never citable. It now uses the same matcher, collects nested books, and resets its citable set
when the user starts speaking (the start of a turn, which is also how the page groups messages).

**Invalid ISBN.** A refused ISBN used to reach the model as "Invalid input for draftBook". The
model then said "not valid" and the turn ended. Now a tool input that fails ISBN validation comes
back as `INVALID_ISBN`, with the ISBN the model sent and a `next` hint: ask the user to repeat
it, digit by digit, or offer a title search. Both prompts say not to stop at "not valid" (voice
adds that a digit was probably misheard), and the offline Mock answers the same way. A new voice
case, **v-21**, speaks The Hobbit's ISBN with a digit missing (12 digits). The eval checks that
`draftBook` was called and refused and that the answer asks again or offers a title search (the
new "recovers" column). Limitation: the contract checks an ISBN's format (10 or 13 characters),
not its check digit. A misheard digit that keeps the right length passes validation and reaches
the lookup, which then finds nothing or the wrong book. Checking the check digit would change
`POST /books` and every book contract, so it was left out of this step.

**Measured.** Chat on Haiku, tuned + hold-out, under `EVAL_MAX_COST_USD=0.5` ($0.31): 32 of 33
cases ran and pass **every deterministic check and every judge criterion (100 %)**. The earlier
"cited" misses (f-02, a batch answer) now carry their citations. h-15 was skipped by the cost
guard: one more worst-case turn ($0.19) could have crossed the cap. Voice on Nova 2 Sonic, 21
requests ($0.12): **100 % on every check**, including v-21, which answered "Sorry, that ISBN is
not valid. Please say the ISBN again, slowly, or tell me the title and author and I can search
the catalog for you." v-09, the ISBN the previous run misheard, passed this time.

## Readiness waits for the embeddings (2026-10-02)

`/ready` used to ping the database only, so after a reseed under a running API (which truncates
`book_embeddings`) the container stayed healthy while semantic search was empty for up to a
minute — the e2e race found in the Phase 14 clean checkout. Now `/ready` also counts active books
without a vector for the configured embedding model and dimensions; while any are missing it
answers **503 `NOT_READY`** with `details: { reason: 'embeddings_pending', missing, model }`, and
the probe itself starts the catch-up sync (single-flight, shared with the interval sync, so
repeated probes never embed twice). `compose up --wait` therefore returns only once vectors match;
smoke and Playwright also wait for `/ready` 200 in a global setup (Playwright reads it on the API's
port, since nginx proxies `/api` only), because Compose marks a container unhealthy only after 30
failed probes and a reseed can happen while it is already healthy. A test reseeds under a running
API and checks 503 → 200 and a description-only semantic search afterwards. A librarian's edit
does not make the API unready: the old vector keeps serving until the background re-embed lands.
`READY_REQUIRE_EMBEDDINGS=false` is the escape hatch when a real embedding provider is down
(the stack comes up; search falls back to lexical).

## Explained recommendations: twelve candidates, one small-model call, allowlisted (2026-10-02)

`GET /ai/recommendations` (the "For your shelves" section of the reading-list page) builds at most
twelve candidates — the reader's favourite genres by rating, interleaved with the books nearest to
the centroid of their shelf's embeddings (so a dystopia reader with no favourites still gets
dystopias) — and asks the model for up to six, each with one or two sentences citing the shelf
entries it follows from. The shelf, favourites and candidates are data blocks; the answer is a
forced tool validated by Zod; a pick outside the candidates, a citation to an entry not shown and
a repeat are dropped. It runs on the **small tier (Haiku)**, not the strong one the plan named: it
is a page section, and the chat comparison showed what the strong tier costs in seconds.
Fallbacks: an empty shelf makes no model call (`reason: no-history`); invalid output twice, or the
model being down (503), shows the plain "For your shelves" list with a note.

Measured on 12 reader profiles (8 EN, 4 FR) on Haiku: an obvious match among the picks for 91 % of
the profiles that have one (Persuasion after Pride and Prejudice, La Peste after L'Étranger,
another Dahl after Matilda), every pick in a genre the reader reads or favours, explanations in the
right language 100 %, 73 % naming a cited shelf book in the sentence itself, 1.4 % of the raw picks
dropped by the allowlist and 0 violations after it; $0.0050 and p50 4.3 s per profile.

## MCP: the registry over stdio, the host's approval as the confirmation (2026-10-02)

`apps/mcp` logs in headlessly (no Origin, so the API returns a Bearer token; a 401 after the
15-minute expiry logs in again once), reads the account's role from `/auth/me`, and serves
`registry.list(actor)`: 8 tools for a reader, 9 with `draftBook` for a librarian. It is built on the
SDK's low-level `Server`, not `registerTool`, so the registry's own JSON Schemas are served (object
roots: the Zod-to-JSON conversion that broke Moonshot is not repeated). Every call goes through
`registry.call` (role gate and validation) and the REST API as that account; `searchBooks` uses the
API's hybrid search; `draftBook` looks Open Library up from the MCP process (lookup only, no model).
Errors are tool results with `isError` (a reader's `draftBook` is `FORBIDDEN: …`), never crashes.

Changes are not turned into pending actions here: an MCP client asks its user before running a
tool, which is the confirmation step this transport already has, so the tools carry honest hints
(`readOnlyHint: false` for the reading-list changes, `destructiveHint` for removal and the batch, all idempotent).
Verified with MCP Inspector's CLI (tool lists for both demo accounts, a search, a librarian draft)
and `pnpm --filter @library/mcp smoke`, which also calls `draftBook` as a reader directly (the
Inspector's client refuses to call a tool the server did not list). Cost if wrong: a client that
auto-approves tools would let its model change the reading list without asking; the account is the
limit of what it can do.

## Voice agent: Nova 2 Sonic for speech, the chat agent's pieces for everything else (2026-10-02)

The mic button in the chat drawer opens a WebSocket (`/api/v1/ai/voice`) to the API, which holds
one Nova 2 Sonic bidirectional stream (eu-north-1, `VOICE_MODEL`, HTTP/2 handler) per user. Speech
recognition, the reply and the voice are Nova's; everything that touches the catalog is the text
agent's, unchanged: tools from the registry per role, `proposeAction` for changes, the
`/ai/actions/confirm` endpoint and card for confirming, the citation allowlist. Voice adds the
transport, the `[app]` lines that tell the model what the page did ("[app] The user confirmed on
screen: …"), and the limits. **Voice alone can never confirm**: there is no confirm tool, the token
only reaches the page, and spoken words reach the model only as audio, never as an `[app]` block.

Step 0 (one scripted real session, then a second after a fix) settled the protocol before the
design froze: a tool result must be a JSON object, barge-in arrives in both documented forms at
once, `usageEvent` totals are cumulative, the service closes after 55 s without audio, speech
costs ~9.5 tokens/s in (silence included: the open mic is billed) and ~25 out, and first audio
comes ~1.2 s after the end of speech. None of it changed the design; it set the idle close, the
eval's cost estimate and the tool-result shape.

The WebSocket upgrade is checked before it is accepted (Origin in `CORS_ORIGINS` against
cross-site hijacking, the session cookie with the same role/disabled lookup as `authenticate`;
plain 401/403 otherwise). After accepting: one session per user (4409), `VOICE_MAX_SESSIONS`
(4503, under AWS's 20), `VOICE_SESSIONS_PER_HOUR` and the `VOICE_DAILY_SECONDS` budget (4429,
summed from the day's `VOICE` runs), frames above twice real time dropped, ping every 20 s, a
graceful end at `VOICE_MAX_SECONDS` (420, under Nova's 8-minute cap) with a spoken goodbye and no
renewal, an idle close after a minute without speech. Audio is relayed and dropped: nothing is
stored, logs carry no payloads, Bedrock invocation logging is off. One `AiRun` per session with
speech and text tokens and its cost. Offline stacks and every test run a scripted mock (energy
turn detection, a fixed three-turn script); the e2e drives it through Chrome's fake microphone
playing a committed WAV.

Measured on 20 spoken EN/FR requests (21 since v-21) (macOS `say` fixtures streamed at real-time pace; Nova itself
decides the tool calls): see the voice row under "Measured results". Cost if
wrong: the session registry is in-process, so a confirm must reach the instance that holds the
session (sticky sessions or pub/sub beyond one instance); Safari's AudioWorklet quirks are untested.

## Voice is a call; dictation is the browser's (2026-10-06)

Two features that must not be confused. **The call** (Phone icon) is the Nova 2 Sonic agent
above, now presented as a phone call: a full-screen, always-dark dialog with no message box,
captions, a timer against the server's `maxSeconds`, Mute (the track is disabled, so silence
frames keep flowing and the server's idle rule still applies), a minimized pill that keeps the
call going while the reader browses, and one "Call · mm:ss" record in the chat log afterwards.
The session moved out of the drawer into `features/call/callSession.ts` so it survives
navigation. The librarian speaks first: the client sends `start.greet`, and the session sends
one interactive `[app]` cue after `ready`, the same mechanism as the time-limit goodbye. It is
opt-in, so the voice eval and other clients are unchanged. **Dictation** (the Mic in the
message box) types what the reader says and never sends: the Web Speech API, hidden where the
browser lacks it (Firefox). Trade-off: in Chrome the audio goes to Google's speech service, not
our servers; the call keeps our own pipeline. A server-side transcription path would keep the
audio in our stack but adds an endpoint, AWS cost and latency for a convenience feature.

"Ask about this book" sends the book as an optional `context: { bookId }` on `POST /ai/chat`;
the agent loads it with the reader's permissions and gives it to the model as a
`current_book` data block (never instructions), and an unknown id is ignored. Cost if wrong:
dictation depends on the browser vendor's speech service and does not exist in Firefox; the
typed chat and the call do not.

## The redesign: dark-first, generated covers, GSAP motion (2026-10-08)

The web app was redesigned end to end (the visual system is in `docs/design-system.md`); the
behavior, data flow and API stayed, apart from one optional search field. What was decided:

- **Dark-first.** Dark is the default theme; light and "follow the system" are a persisted
  toggle. The covers are the content, and a dark ground makes them read as objects; the call is
  always dark anyway. Cost: two themes to keep right, so `scripts/contrast.mjs` (part of lint)
  checks every text pair in both, plus the paper scope and every cover stage.
- **Generated covers, DOM and CSS.** A flat field, one geometric shape and the typeset title,
  chosen by stable hashes of the title from the domain's palette, each palette entry paired with
  a dark "stage" color for heroes. The catalog has no licensed cover art; generated covers cost
  no image requests, follow the theme, stay `aria-hidden` (the link names the book) and give the
  app one identity. A real `coverUrl` still wins. Cost: they are not the real covers, and long
  words need a sizing rule (`coverTitleSize`).
- **The book page is an open book, opened with GSAP rather than View Transitions.** The motion
  is a 3D hinge: the front board turns on the spine (`rotateY` with perspective, back faces
  hidden) to show the library card, then the page content rises and the stamp lands. It must be
  fast-forwarded by any key or click, reversed by Close (the book flies back onto its cover),
  and skipped on Back and direct loads. View Transitions crossfade or morph snapshots of named
  elements; a hinge between real elements with their own 3D layering, interruptible and
  reversible, is not what they do, and cross-browser support was still partial. A GSAP timeline
  on the real DOM does it, inside `gsap.matchMedia`: under reduced motion it is a 0.2 s fade.
  The clicked cover's box goes through a transient store; only covers on the app's own pages
  record it, so covers in the chat drawer and the ⌘K menu open the page without the flight
  (a product decision). Cost: GSAP is a 41 kB (gzip) chunk, loaded on demand.
- **Six motion moments, nothing else moves.** Book open, Flip (My shelf between states, the
  catalog grid on filter/sort changes), the signed-out headline once per session, the call orb
  following the audio (`quickTo` on the existing analyser levels), the ⌘K menu, and stamps.
  `lib/motion.ts` registers the plugins once; entry-chunk code reaches it only through
  `lib/motionPrefs.ts`. Flip reads the old layout in a class component's
  `getSnapshotBeforeUpdate`, the one React hook that runs after render and before the DOM
  changes; elements that leave fade out where they were instead of leaving a blank. The e2e
  suite runs with reduced motion by default (assertions meet a UI at rest) plus one spec with
  motion on that fails on any console error.
- **⌘K uses cmdk inside our own dialog.** cmdk gives the filtering and keyboard model; it is
  rendered inside the native `Dialog` (cmdk depends on Radix Dialog, which is never rendered)
  and loads as its own chunk on first use. Books come from the catalog's own list query; shelf
  actions use the existing optimistic mutations.
- **"Why it matched" is one optional field.** The hybrid search response gained an optional
  `match` (semantic rank, fused rank, rank after a rerank, and whether the title, the author, a
  close spelling or the meaning matched), computed deterministically in the service; no new
  endpoint and no model call. The keyword leg is shown as a rank, not a score: its trigram
  similarity stays inside the SQL query, and the fusion only ever used ranks.
- **Voice as a call, dictation in the browser**: see the 2026-10-06 entry above.
- **The Activity page names people and things (2026-10-09).** The audit API returned ids only;
  each entry now also carries an optional `actor` (name and role) and `entityLabel` (a book's
  title, a genre's name, the book of a reading-list entry, an account's name), resolved in one
  query per kind for the page shown. It shows readers' reading-list activity to librarians,
  which the API already allowed; a filter narrows it to the catalog.
- **Activity opens on the catalog (2026-10-10).** Books and genres by default; reading lists,
  favorites and accounts only when a librarian picks them in the filter. Libraries treat what a
  patron reads as private; the API still allows it, the page just does not lead with it. The
  audit filter takes several kinds at once (`entityType=book,genre`).
- **Books have a language (2026-10-10).** `language` (an ISO 639 code, nullable) on the book, the
  list filter (`language=fr`, several allowed), the librarian form, the library card and the
  table, and the agent's `searchBooks` (by meaning, the results are narrowed to the languages
  asked for). The seed data always had it; the migration backfills the demo catalog by title and
  author, so an existing database needs no re-seed. The eval after it was 31/33: the judge marked
  a genre list (f-04) and an ISBN draft (f-06) "uncited", against its own rubric, and f-04
  "ungrounded" for saying a reader may pick five favorites (true, but not a claim about a book).
  Both failed twice with the same answers. The rubric now says that sentences about the app do not
  count for `grounded`, and that `cited` is true when no `searchBooks` or `getBook` call ran.
  The full suite then passed 33/33, hold-out included ($0.34).
- **Test runs have their own database (2026-10-10).** `compose.test.yaml` names its own Compose
  project, so e2e (which re-seeds and creates accounts) never touches the data of `pnpm stack` /
  `pnpm stack:real`. Same ports: `pnpm stack:test` stops the other project first, and back.
- **Less JavaScript before the first page (2026-10-10).** The chat drawer and the call screens
  load on first use; `react-hook-form` left the shared chunk (the form resolver moved out of the
  module every page loads); GSAP is preloaded when the browser is idle; the signed-out headline
  waits at most 300 ms for its motion; the session check starts at boot. Entry JS 288 → 257 kB
  (90.6 → 81.4 kB gzip). Lighthouse's simulated phone did not move beyond its run-to-run noise:
  first paint waits for the render-blocking stylesheet and the app's boot, which only
  prerendering or inlined critical CSS would shorten.
- **A phone in e2e, Lighthouse in CI (2026-10-09).** A `mobile` Playwright project (390 × 844,
  touch) checks that pages never scroll sideways, the narrow layouts and axe in both themes.
  Lighthouse runs after e2e against a committed baseline: accessibility, best practices and SEO
  may not drop; performance has 15 points of slack, since CI runners are slower and noisier.
- **Two e2e timing limits (2026-10-11).** The phone axe test visits six pages and runs first in
  its worker (cold start), so it took 20–23 s against the 30 s default; it now has 60 s, like the
  voice call test. The voice call test makes one call per browser: Chrome's fake microphone
  sometimes delivers silence to a second call in the same browser process (`--repeat-each` with
  one worker failed 2 of 5; five separate browsers passed 5 of 5), so repeat it with
  `--workers` equal to the repeat count.

## A free public demo: one Render service, Neon, the Mock (2026-10-17)

The Compose stack (nginx in front, a one-shot migrate container, the API) does not map onto a free
host. Render's free plan runs one always-available service at 512 MB and 0.1 CPU, sleeps after 15
minutes and has no pre-deploy step. So the deploy is one container: the API serves the built web
app when `WEB_DIST_DIR` is set (same origin, so cookies, the origin check and the voice socket
work unchanged), and the start script migrates, seeds and starts. The database is Neon's free
plan (Render's free Postgres expires after 30 days). Local Compose is untouched; the Render image
has its own Dockerfile under `deploy/render`.

Measured on the image with `--memory=512m --cpus=0.1`: about 100 MB in use. A wake-up first took
91 s: 42 s starting the Prisma CLI to find nothing to migrate, 23 s seeding (two bcrypt-12
hashes), 25 s loading the app. A check of `_prisma_migrations` against the migration folders now
skips the CLI when nothing is pending, and `BCRYPT_ROUNDS=10` (the OWASP minimum; 12 stays the
default elsewhere) makes hashing four times cheaper, so a wake-up takes about 40 s and a login
about 1.3 s instead of 6 s. The full e2e suite passes against the image. In one process, static
files wait behind password hashing under parallel load, which nginx avoided; for a demo's traffic
that does not show. Every start reseeds, so each reviewer gets a clean library. Voice stays off: the
offline voice answers a fixed script, which would mislead a visitor.

## Local embeddings are a build-time opt-in (2026-10-01)

`EMBEDDING_PROVIDER=local` (bge-small via `@xenova/transformers`) stays in the design, but its
ONNX stack costs ~55 MB in the runtime image and glibc binaries that Alpine cannot load. The
default API image excludes it (under the 300 MB gate; sizes in docs/guide.md) and serves `mock`
and the Bedrock models (Cohere, Titan); `WITH_LOCAL_EMBEDDINGS=true API_RUNTIME_BASE=node:22-bookworm-slim docker compose build
api` produces the variant (382 MB). The provider itself fails fast with that instruction when the
package is absent. Cost if wrong: anyone who flips `EMBEDDING_PROVIDER=local` on the default image
gets `AI_UNAVAILABLE` with a message, not silent degradation.

Why offer a local model at all: semantic search (Phase 12.5) should work offline and without an
AWS account, and bge-small is good enough for English titles and synopses. It is English-centric,
so Arabic and French recall would be reported separately.

## Real-provider checks are scripts, not gates

Phase 11 first ran before any credential worked, so everything that needs a key sits behind an
environment flag: `pnpm --filter @library/ai check:bedrock` (model listing, one forced-tool call
per model, one Titan embedding) and `pnpm --filter @library/ai test:providers` (one contract call
per configured provider), and for voice `pnpm --filter @library/ai voice:step0` (the scripted real
session that settled the protocol) and `test:voice` (one short real Nova session). Once the
credentials arrived, both ran and their findings became the
corrections listed under "AI usage"; the confirmed ids and prices are in `apps/api/.env.example`
and `packages/ai/src/cost/pricing.ts`. CI runs the real suites only when the secrets exist, and
reports rather than gates them: a model's score moves with the model, our invariants do not.

Where the prices in `pricing.ts` come from (USD per million tokens, confirmed 2026-10-01 with real
calls from eu-central-1 and the vendor pages):

- **Claude**: the list prices at https://platform.claude.com/docs/en/about-claude/pricing. Bedrock
  bills the same rates; the `eu.`/`us.` geo inference profiles cost 10 % more than `global.` for
  Claude 4.5 and later. Sonnet 5.5 answered 403 on this account and is priced for when access
  lands.
- **Titan Text Embeddings V2**: $0.02, in-region in eu-central-1 with the bare id.
- **Cohere on Bedrock**: input only, us-east-1 list prices, not yet verified for the EU profile.
- **Moonshot Kimi**: https://platform.kimi.ai/docs/pricing/chat. kimi-k3 is $3 in (cache miss),
  $0.30 (cache hit) and $15 out; kimi-k2.6 is $0.95 / $0.16 / $4. Caching is automatic, so writes
  bill as ordinary input.
- **Unknown models** cost 0 and are reported as `known: false`, not guessed.

## Dependencies and why each is there

| Dependency                                                                                          | Where | Why                                                                                          |
| --------------------------------------------------------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------- |
| `zod`                                                                                               | all   | The contracts; validation, types, OpenAPI and tool schemas from one definition.              |
| `express`, `helmet`, `cors`, `cookie-parser`, `express-rate-limit`                                  | API   | HTTP, security headers, CORS, cookies, per-route limits; small and proven.                   |
| `@prisma/client`, `@prisma/adapter-pg`, `pg`                                                        | API   | Typed queries; the pg adapter is how Prisma 7 connects.                                      |
| `jsonwebtoken`, `bcryptjs`                                                                          | API   | Access tokens; password hashes without a native build.                                       |
| `winston`                                                                                           | API   | JSON logs with request ids and redaction.                                                    |
| `swagger-ui-express`                                                                                | API   | Serves the generated OpenAPI document at `/api/docs`.                                        |
| `@anthropic-ai/sdk`, `@anthropic-ai/bedrock-sdk`                                                    | AI    | Claude on Anthropic and on Bedrock through one code path.                                    |
| `@aws-sdk/client-bedrock-runtime`, `@smithy/node-http-handler`                                      | AI    | Titan and Cohere embeddings; Nova 2 Sonic's bidirectional stream over HTTP/2.                |
| `ws`                                                                                                | API   | The voice WebSocket (`noServer`, on the API's own HTTP server); browsers use the native one. |
| `openai`                                                                                            | AI    | OpenAI-compatible client for Kimi; no OpenAI account is used.                                |
| `@modelcontextprotocol/sdk` (+ `@modelcontextprotocol/inspector`, dev)                              | MCP   | The MCP server over stdio; the Inspector verifies it.                                        |
| `@xenova/transformers`                                                                              | AI    | Optional local embeddings, loaded lazily, excluded from the default image.                   |
| `react`, `react-router`, `@tanstack/react-query`, `zustand`                                         | web   | UI, routing, server state, client state.                                                     |
| `react-hook-form`, `@hookform/resolvers`                                                            | web   | Forms validated by the contract schemas.                                                     |
| `i18next`, `react-i18next`                                                                          | web   | English and French UI (see above).                                                           |
| `tailwindcss`, `clsx`, `tailwind-merge`, `lucide-react`                                             | web   | Styling from design tokens; icons.                                                           |
| `@fontsource-variable/geist`, `@fontsource-variable/geist-mono`, `@fontsource/ibm-plex-sans-arabic` | web   | Bundled fonts (Geist, Geist Mono for data, IBM Plex Sans Arabic): no font CDN.               |
| `gsap`, `@gsap/react`                                                                               | web   | The six motion moments (Flip, SplitText included); a lazy chunk, never in the entry bundle.  |
| `cmdk`                                                                                              | web   | The ⌘K menu's filtering and keyboard model, inside our own native dialog; a lazy chunk.      |
| `vitest`, `supertest`, `msw`, `@testing-library/*`, `@playwright/test`, `@axe-core/playwright`      | dev   | One test runner everywhere, HTTP tests, mocked network, component tests, e2e, accessibility. |
| `lighthouse`                                                                                        | dev   | `pnpm --filter @library/web lighthouse`: scores of the built app, run on demand.             |
| `turbo`, `typescript`, `eslint` (+ react-hooks, jsx-a11y), `prettier`, `actionlint`                 | dev   | Build graph, types, lint (accessibility rules included), format, workflow validation.        |

## Where this breaks at scale

- **Search**: two GIN trigram indexes and a forced plan are right for thousands of books, not
  millions; past that, a search engine or `tsvector` with ranking.
- **Embeddings**: `vector` is untyped and KNN is exact (no ANN index), fine for ~120 books; a
  real catalog needs a typed dimension and HNSW, which means one model per column.
- **Soft deletes without partial indexes**: every query filters `archivedAt IS NULL` on plain
  indexes; at scale, partial indexes (and accepting them as hand-managed migrations).
- **Rate limits and the Open Library cache** are in process memory: two API instances do not
  share them. Each limiter takes an optional `store` (`RateLimitOptions`), so shared counters are
  a store such as `rate-limit-redis` passed in `server.ts`, not a code change; the cache would
  need the same.
- **Auth reads the role on every request**: one primary-key lookup per call, deliberately; at
  high traffic, a short cache with explicit invalidation on role change.
- **Audit log** is an ordinary table written in the same transaction: unbounded growth, no
  retention policy.
- **AI traces** (`ai_runs`) likewise; and the per-user AI limiter is per process.
- **Bedrock on-demand quotas**: a new account answered `429` after a few sequential calls. The app
  fails fast to "AI unavailable"; production needs a quota increase or provisioned throughput.
- **Voice sessions** live in one process (the confirm endpoint finds the open session there), the
  per-user limits are counted per instance, and Nova allows 20 concurrent sessions per account:
  several instances need sticky sessions or pub/sub, and a busy library a quota plan.
- **Pending actions** (`pending_actions`) are never pruned: one small row per proposal.
- **MCP** runs one process per client and account; its changes rest on the client's approval
  prompt, which a client set to auto-approve skips.

# AI usage

## How AI was used to build this

The build was done with Claude Code, one phase per instruction from a written plan (now
[docs/build-plan.md](docs/build-plan.md)),
each step closed by a "Verify" command whose output was reported, and the whole gate
(`typecheck`, `lint`, `test`) green at the end of every phase. The human reviewer accepted or
corrected each phase before the next one started. Real provider calls were made only when asked,
under a cost cap, and every paid run's spend is reported below.

## What changed since the previous project

The starting point was an employee directory (Express + MySQL + React with PrimeReact). Kept as
ideas: the middleware order, the single-flight token refresh in the HTTP client, the
error-class hierarchy, the strict TypeScript flags. Rewritten: MySQL → PostgreSQL, Jest → Vitest,
express-validator and hand-written Swagger → Zod contracts and generated OpenAPI, plain-text
refresh tokens → hashed rotating families, a permission matrix → two roles checked in the
services, file uploads and AWS S3 → none (generated covers or an Open Library URL), PrimeReact →
owned components. On i18n, the plan's reasoning for dropping it was, verbatim:

> Adds cost without value here: half the UI was hard-coded English anyway, and the multilingual
> requirement is for AI _queries_ (EN/AR/FR), not UI chrome. User-visible vocabulary comes from
> `domain-config` instead (needed for domain swap). Text inputs get `dir="auto"` so Arabic queries
> render correctly.

It was reinstated after Phase 9, narrower (English and French), for the reasons in "i18n was
dropped, then reinstated" above.

## What the model may do in the product

- **Natural-language search**: one small-model call turns text into filters. Genres must come from
  the live list, years must be real, the query is clipped to the contract; the model never
  searches, the ordinary catalog query does.
- **Autofill**: the model fills gaps in an Open Library record and gives a second opinion on the
  year. It never touches the title, ISBN or cover, and nothing is saved without the librarian.
- **Hybrid search**: the model may only reorder the candidates it was shown (a permutation subset,
  checked by the schema); nothing it omits is lost. Off by default.
- **Chat**: the agent may call the tools the user's role allows; reading tools run, changes are
  only proposed (a stored pending action and a card) and run once when the user presses Confirm.
  It may cite only books a tool returned in that turn.
- **Recommendations**: the model picks from at most twelve candidates and may cite only the shelf
  entries it was shown; anything else is dropped.
- **Voice**: the same tools and proposals as chat; it can never confirm (only the page can), and
  `[app]` lines (what the page did) are the only text that reaches it from the page.
- **MCP**: the tools of the logged-in account's role, run as that account once the MCP client
  approves the call.
- **Everything it reads from outside** (Open Library descriptions, subjects, titles; catalog
  text) is serialised as JSON inside `<data>` blocks under a rule that their content is data,
  never instructions. Everything it returns is validated, then filtered by allowlists.
- **Every call** has a token and time budget, is traced (`ai_runs`: provider, model, tokens,
  cached tokens, cost, latency, fallback), and degrades to the non-AI path when the provider is
  down or slow.

## Security tests

**Phase 12.4** covered the AI surfaces that existed then: prompt injection through an Open
Library description and through the reader's own text, against a model that obeys the injection
(outputs stay within live genres, real years, active books, and the identity fields); readers
calling `draftBook` get 403 from the HTTP route and FORBIDDEN (403) from the shared tool registry;
garbage, oversized, extra-key and wrong-type model output gets one retry, then the fallback with
`fallbackUsed`, never a 500; a provider that never answers is `AI_UNAVAILABLE` at the budget
timeout; confirm tokens reject an edited payload, a transplanted signature, another secret, the
expiry instant and another actor. The `injection` eval suite runs 20 attacks (EN/FR/AR) on any
provider and fails on any violation.

**Added with each later surface:**

- **Chat (12.7)**: an injected synopsis reaches the model only inside a `tool-result` data block
  and cannot trigger a mutation by itself; a reader's `draftBook` call is refused by the registry;
  a mutating call is a pending action (nothing written); confirm-token tampering is 401, another
  user 403, a replay or a concurrent second confirm 409; answers cite only tool-returned ids.
- **Recommendations (12.6)**: picks outside the candidates and citations to entries the model was
  not shown are dropped (tested with a model that returns both); the eval gates 0 violations for
  every provider.
- **Voice (13.2)**: the upgrade is refused without a session cookie (401), from a foreign Origin
  (403) and for a disabled account; one session per user, a server cap, an hourly and a daily
  limit; frames faster than twice real time are dropped; a mutating tool call is only a pending
  action, and the model is told of a confirm only through an `[app]` line the page caused.
- **MCP (13.1)**: a reader account sees eight tools, not `draftBook`, and calling it anyway is a tool
  error (`FORBIDDEN`), not a crash; invalid input is a tool error too.

## Measured results

On Claude Haiku 4.5 (Bedrock, eu-central-1) unless the row says otherwise — Cohere embeddings for
retrieval, Nova 2 Sonic (eu-north-1) for voice; full tables in docs/evaluation.md, raw rows in
`packages/ai-eval/results/`:

| Suite                    | Result                                                                                                                                                                                                           |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| nl-search (34, EN/FR/AR) | 97.1 % exact with the compact prompt ($0.0034/query), 100 % with the padded one                                                                                                                                  |
| autofill (24 books)      | 75.0 % exact strict, 79.2 % lenient; year second opinion 3/4 flagged, 0 false flags ($0.0029)                                                                                                                    |
| injection (26 attacks)   | 0 violations; Haiku obeyed 1 attack raw (a pasted JSON answer), the allowlist dropped it; the 6 agent attacks never led to a proposed change                                                                     |
| retrieval (49 cases)     | real recall@5: lexical 46.5 %; hybrid on Cohere multilingual v3, cutoff 0.44: 95.3 %, nonsense 100 % empty; rerank off                                                                                           |
| agent (33, EN/FR)        | chat on Haiku 4.5: tools, pending actions, nothing written, citations and judge 100 % on the 32 cases that ran (h-15 skipped by the $0.50 cap); citations now server-side from titles; $0.0067 / turn, p50 3.3 s |
| voice (21 spoken, EN/FR) | Nova 2 Sonic: tool calls right 100 %, changes only proposed 100 %, nothing written, barge-in heard, invalid ISBN recovered (v-21); first audio p50 1.9 s / p95 3.4 s; $0.0059 / request                          |
| recommend (12 profiles)  | Haiku 4.5: obvious match 91 %, related genre 100 %, right language 100 %, 0 allowlist violations; $0.0050 / profile, p50 4.3 s                                                                                   |

**Prompt-cache hit rates.** Haiku 4.5 caches only prefixes of 4,096+ tokens: the compact
nl-search prompt never caches (0 cached tokens, by design); the padded prompt read 151,503 tokens
from cache over 34 calls, 33 of which were cache reads after a single write. Autofill's prompt is
below the minimum and does not cache. Kimi caches automatically and reported every prompt token
of a repeated prefix as cached in the contract test; it was not evaluated at volume.

**Spend on real providers:** about $0.36 for the nl-search evaluation runs (Phase 12.2), $0.26 for
autofill (12.3, including diagnosis), $0.13 for the year second opinion and the injection suite
(12.4), $0.19 for hybrid search and the rerank comparison (12.5: three retrieval runs, 164 calls)
plus $0.00016 to embed the catalog with Titan; the 49-case hardening and cutoff calibration cost
another $0.0002 (a re-embed and ~100 query embeddings, no model calls); the embedding
experiments cost about $0.26, almost all of it the one-time FR/AR expansion ($0.2545); the agent
suite cost $0.69 over three real runs (Kimi K3 agent $0.45, Haiku judge $0.24); the chat model
comparison and hold-out $1.12; the voice agent about $0.25 (step 0, one contract test, two full
voice evals at ~$0.11 each); the remove-tool hold-out re-run $0.09 and the recommendation eval
$0.06, the batch hold-out, its h-10/g-11 re-run and the injection suite with the agent surface
$0.24, the confirm-twice re-runs (agent $0.32, voice $0.10) $0.43 — about **$4.07**, plus the citation and ISBN re-runs (agent $0.31, voice $0.12) — about **$4.51 in all**. Phase 11's contract checks and 12.1's spot checks were single
calls, not separately totalled. Every paid run printed its worst-case estimate first and stayed
under its cap.

## Corrected AI output, from real runs

### After the first real calls (Phase 11)

Each was invisible with the Mock provider and fake clients; each is now pinned by a unit test with
a fake client that reproduces the real response.

- **Cached input priced at zero** — Bedrock/Anthropic `input_tokens` excludes cache reads/writes
  (OpenAI's `prompt_tokens` includes them); `tokensIn` is now the total, so cost subtracts the
  cached part correctly.
- **Every Bedrock call traced at $0** — Bedrock echoes the base id (`anthropic.claude-haiku-…-v1:0`)
  instead of the `eu.` profile that was called and billed; results now carry the requested id.
- **Kimi refused the temperature** — `400 … only 1 is allowed for this model`: the provider adopts
  the stated value per model and retries once.
- **Kimi refused the forced tool** — `400 tool_choice 'specified' is incompatible with thinking
enabled`: the documented `auto` + "must call" fallback, which Kimi now starts in.
- **Kimi caching misreported** — `/ai/status` said `cachingSupported:false` while Moonshot reported
  every prompt token as cached; Kimi now declares automatic caching.
- **One model-id pair for every provider** — the Kimi call was sent a Bedrock model id; each
  provider (and each tier, via `AI_PROVIDER_STRONG`) now reads its own ids.

### During the evaluation (Phase 12.2)

- **Break-even of "1 search"** — the eval took the first padded call as the cache write, but
  that run started on a cache still warm from a run 4 minutes earlier, so every call was a read.
  Detected because the "first" call cost $0.00168, the same as every later call, against $0.0075
  for a write in the previous run, and its JSON row showed 0 cache-write tokens. Cache writes are
  now identified by those tokens. A run with none says "break-even unknown". The cold rerun gave 4.
- **Quota scored as quality** — 47 of the first 68 Haiku calls got `429 Too many requests`
  (new-account quota) and counted as misses. The eval runner now retries 429s with backoff and
  reports them as "throttle retries". The app still fails fast to `AI_UNAVAILABLE`.
- **Mock parser blind to Arabic** — JavaScript `\b` is ASCII-only, so no Arabic sort or year
  word ever matched (Arabic exact 0 %). The word boundaries are now Unicode-aware. The parser
  also accepts the article ال and feminine/plural endings, drops a generic "novel" word when a
  specific genre matched, and reads decades in any century (Mock exact 52.9 % → 79.4 %). The
  remaining Mock misses are left in the cases on purpose, so the gate does not teach to the test.

- **Web tests missing from CI since Phase 10** — the `quality` job ran `pnpm coverage`, and the
  web app has no coverage task, so its 86 tests ran locally (`pnpm test`) but never in CI. Found
  while reading the coverage log for the per-package lines. CI now also runs the web tests.

### During autofill (Phase 12.3)

- **Haiku leaked its parameter markup into the synopsis** — asked for every field, it wrote a
  synopsis that was not missing, and the string ended in `</synopsis>\n<parameter
name="genres">[…]`, so `genres` never arrived. The retry was byte-identical: 5 of 23 calls
  fell back. Each call's tool schema now holds only the missing fields, genres first and the
  synopsis last. Fallbacks 21.7 % → 0, exact 54.2 % → 75.0 %, output tokens 299 → 85, cost per
  draft $0.0045 → $0.0026.
- **Edition year, not first publication** — the books "data" API dated _1984_ 1989 (found in
  the one manual Open Library check). Lookups now use the search index and the work record.
- **A loose ISBN match taken as the book** — the guard "the work must list the ISBN", applied to
  the top hit only, then rejected _Steve Jobs_, whose listing work was not ranked first. It now
  takes the first of five hits that lists the ISBN.
- **A placeholder ISBN that names a book** — 9780000000002, meant as the unknown-ISBN case, has
  an Open Library record ("The three voices of poetry", 1985). The case now uses an unassigned
  979-10 number.
- **Quota hidden by graceful degradation** — autofill answers a provider error with the
  lookup-only draft, which also hid Bedrock 429s from the eval's retry. The outcome now carries
  `unavailableReason`; the eval retries quota errors and still never counts them as misses.
- **Backoff counted as latency** — the eval's total time included the 429 waits (p95 9.6 s). It
  now times only the answering attempt (p95 3.3 s).

### During the security tests (Phase 12.4)

- **An injection that turned into a 503** — the test with a model obeying an injected request
  failed with `AI_UNAVAILABLE`: a `q` at the 200-character limit plus the dropped genre words was
  clipped to 200 characters _plus_ an ellipsis, `BooksQuery` rejected the 201st, and the error
  surfaced as "provider unavailable". The plain-search fallback had the same bug for a 300-character
  request. `clip()` now never exceeds its limit, ellipsis included; both cases are tests.
- **"403 from both layers" was not literally true** — the registry rejected readers with a
  `ToolError` that carried no HTTP status. Tool errors now map to 403/400/404 (500 for a tool
  breaking its own output contract), and the API's error handler answers them like any other.
- **A fresh clone could not build** — found by the clean-checkout run: `pnpm install` never
  generated the Prisma client (CI and the Dockerfile did it explicitly). The API now generates it
  on install, and `prisma generate` alone accepts a missing `DATABASE_URL` (it never connects).

### During hybrid search (Phase 12.5)

- **A rerank that "fell back" 9 times out of 24** — the traces showed no model attempt at all:
  Bedrock answered 429 (account quota) and the endpoint correctly served the fused order, which
  made a quota problem look like a quality one. The response now says `meta.rerank: unavailable`
  (as distinct from `invalid`), and the eval retries those as quota.
- **Backoff counted as latency, again** — the rerank's p95 read 7.7 s because the client timed the
  429 waits; the eval now times only the answering attempt (1.5 s). The same bug as in autofill,
  in a second runner.
- **A saturated metric** — hybrid reached 100 % recall@5, so recall@5 could not show what the
  rerank does; hit@1 and MRR@5 were added, which is where its one-query gain shows.
- **Two models' vectors could meet** — KNN restricted by dimension only, and the Mock and Titan
  were both 512-dimensional here; a half-finished re-embed would have ranked Titan queries against
  Mock vectors. KNN now compares only vectors of the query's model.
- **A contract that never ran on the fakes** — the port contract suite ran against the API adapters
  only, not the fake ports the AI tests rely on; it now runs against both.

### During the retrieval hardening (Phase 12.5)

- **The automatic cutoff choice would have shipped a useless value** — "the middle of the range
  that keeps recall" picked 0.07 on Titan, which empties no nonsense at all, because no range
  satisfies both goals. The report now prints the evidence on both sides (strongest nonsense
  neighbour, weakest semantic-only hit), and the choice was made from the sweep, not the picker.
- **A reseed emptied the vectors under a running API** — found by the e2e run: re-running
  `docker compose up` reran the one-shot seed (`SEED_ON_START=always`), which truncates
  `book_embeddings`, while the API kept running and only synced at start. Semantic search and
  "books like this" were silently empty. The API now re-checks embeddings every minute
  (`EMBED_SYNC_INTERVAL_MS`; a hash-diffed no-op when current) and healed a forced reseed in 24 s;
  `/ready` now says 503 `NOT_READY` until the vectors match, so nothing starts inside that window.
- **Our own limiter stopped the eval** — 49 calibration calls exceeded the AI limit of 30 per
  minute; the Compose test overlay (CI, smoke, e2e) now raises it, production keeps 30.
- **A gate pinned on easy cases** — the lexical gate (83 %) was set on the 24 original cases; on 49
  it scores 46.5 % on real queries by design (cross-lingual and paraphrase are not lexical), so it
  was re-pinned at 0.46 rather than left failing.

### During agent chat (Phase 12.7)

- **A tool schema every real provider refuses** — contract schemas registered with an id come
  out of `z.toJSONSchema` as `{ $ref, $defs }`, with no `type: "object"` at the root. The Mock
  never looks; Moonshot answered 400 on the first real turn (Anthropic requires the same). The
  registry now inlines the root reference, and a test asserts every tool schema is an object.
- **An eval that reported the opposite of what happened** — with every case erroring, the summary
  divided by zero answered turns and printed "100 % of turns wrote to the shelf". A run where no
  case ran is now its own failure.
- **The agent claimed what no tool said** (run 1): asked by a reader to draft an entry from an
  ISBN, Kimi K3 searched, then said "that ISBN points to Dune" from its own knowledge. The judge
  flagged it as ungrounded. In later runs it fetched the book with `getBook`, whose ISBN field
  supports the claim.
- **The judge contradicted itself** (runs 1–2): for "I've prepared … please press Confirm" it set
  `claimsUnconfirmedChange` while its rationale said the change was correctly pending; it also
  wanted citations on genre lists and on lookup drafts, which are not catalog books. The rationale
  is now the first field (it reasons before it flags), and the rubric says what needs a citation
  and what a pending change sounds like. Two French verdicts failed validation (rationale over
  400 characters): the limit is 1,000 and a missing verdict is reported with its reason. Run 3:
  every criterion 100 %. The rubric was tuned on these same 18 cases, so the judge's numbers are
  optimistic; the deterministic checks were not tuned.

### During the chat model comparison and the voice agent (2026-10-02)

- **Latency that measured the account, not the model** — the first Haiku run reported p50 24.7 s:
  41 Bedrock 429 retries with backoff were inside the timer. The eval now times the agent turn
  that answered.
- **A proposal that could never succeed** — Haiku proposed `updateReadingState` for books not on
  the shelf; confirming would have failed. `proposeAction` now refuses it with a hint, and the
  model switches to `addToReadingList`.
- **Keywords where the search wants a sentence** — the agent turned "a novel about a desert planet
  with giant worms" into "desert planet giant worms", which the Cohere cutoff (calibrated on
  sentences) rejects; it now passes the user's sentence.
- **A request that changed after it was sent** — the agent loop handed providers its live
  `messages` array and kept appending; a test that inspected a past request saw the future. Each
  step now sends a snapshot.
- **The strong tier pointed at the wrong vendor** — `.env` named Kimi as the strong provider but
  kept a Bedrock id in `AI_MODEL_STRONG`, which the API would have sent to Moonshot. Per-provider
  ids now win.
- **Nova closed the stream on an array** — the first step 0 session died at the first tool result
  ("Unsupported JSON type in Tool Result"); results are objects (`{ books: [...] }`).
- **The WebSocket refusals that never reached the client** — `socket.destroy()` right after writing
  the 401 discarded it (clients saw a hang-up); and the `start` message the browser sends on open
  arrived before the server listened for it. Both were caught by the WebSocket tests.
- **A spoken ISBN with a label glued on** — Nova sent `"9780441172719isbn"`; the ISBN normaliser
  now drops an "ISBN" label anywhere, which also helps people who type "ISBN 978-…".

## What was deliberately not built

- A `getReadingList` tool and several proposals per turn (so "remove every book" could be done in
  one request): see the remove-tool entry.
- Voice renewal past 7 minutes, Arabic voice (Nova has none), and a push-to-talk fallback: the
  typed chat is the fallback.
- An Arabic UI: right-to-left chrome is a separate design task; Arabic is a query and content
  language.
- Reader ratings, uploads, password reset and e-mail: not in the brief.
- Model overrides of Open Library data: the model gives a second opinion, the librarian decides.
- Gating real-provider quality in CI: reported, not gated, because the number moves with the model.
