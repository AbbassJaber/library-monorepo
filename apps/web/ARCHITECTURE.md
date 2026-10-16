# Web app architecture

React 19 + Vite 8, React Router 8 (data router, code-split routes), TanStack Query 5 for
**all** server state, Zustand for the little client state there is, Tailwind 4 with a
CSS-first token file, React Hook Form + the shared Zod contracts for forms.

## State boundaries

| Kind of state | Where it lives                                                                                                                                                                       | Examples                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Server state  | React Query (`src/features/*/queries.ts`, `mutations.ts`)                                                                                                                            | session (`me`), catalog pages, book detail, genres, reading list, favourites, recommendations |
| URL state     | the search params (`features/catalog/useCatalogParams.ts`)                                                                                                                           | `q`, `genre`, `yearFrom`, `yearTo`, `sort`, `page`, `pageSize`                                |
| Client state  | Zustand `src/stores/uiStore.ts` (persisted: `theme`, `locale`, `catalogViewMode`, `catalogLayout`; transient: `toasts`)                                                              | theme, UI language, pages vs continuous scroll, covers vs table, notifications                |
| Session state | Zustand, never persisted: `chatStore` (drawer, conversation), `callStore` (the call as the UI sees it), `commandStore` (⌘K open), `bookOpenStore` (the cover a book was opened from) | what is open, the current conversation and call, the open-book animation's origin             |
| Form state    | React Hook Form with `zodResolver(<contract schema>)`                                                                                                                                | login, register, book form                                                                    |

Nothing fetched from the API is ever copied into Zustand or `useState`.

## HTTP client — `src/lib/api.ts`

- `api.get/post/put/patch/delete` return the API envelope `{ data, meta? }` and throw `ApiError { status, code, details, requestId }` for any non-2xx answer (mirrors `ErrorEnvelope` from `@library/contracts`).
- Cookies carry the session (`credentials: 'include'`); requests are same-origin through the Vite proxy (dev) or nginx (Docker).
- **401 → refresh once → retry**: on a 401 the client calls `POST /auth/refresh` and retries the original request one time. `refreshOnce()` is **single-flight**: any number of concurrent 401s await the same refresh promise (tested: three parallel 401s → exactly one refresh). Login/register/refresh/logout never trigger a refresh. When the refresh fails, `setSessionExpiredHandler` (registered in `app/providers.tsx`) sets `['auth','me']` to `null`, and the route guards redirect to `/login?from=…` on the next render.

## Query keys — `src/lib/queryKeys.ts`

Every key is built by the `qk` factories; no key is spelled out anywhere else.

```ts
qk.auth.me                      ['auth','me']
qk.books.list(query)            ['books','list', normalize(query)]     // page inside the key
qk.books.infinite(query)        ['books','infinite', normalize(query)] // page not in the key
qk.books.detail(id)             ['books','detail', id]
qk.books.newest                 ['books','newest']
qk.books.similar(id)            ['books','similar', id]                // Phase 12
qk.genres.list(includeArchived) ['genres','list', { includeArchived }]
qk.shelf.list                   ['shelf','list']
qk.favorites.list               ['favorites','list']
qk.recommendations.shelves      ['recommendations','shelves']
qk.recommendations.explained    ['recommendations','explained']        // Phase 12
qk.ai.status / qk.ai.search(q)  ['ai', …]                              // Phase 11+
qk.audit.list(query)            ['audit','list', query]
```

`normalizeBooksQuery` parses through the contract, drops defaults (`page=1`, `pageSize=24`,
`status=active`) and sorts keys, so `/catalog?genre=fantasy&page=1` and
`/catalog?page=1&genre=fantasy` share one cache entry. Prefix keys (`qk.books.lists`,
`qk.books.infinites`, `qk.books.all`, `qk.genres.all`, `qk.recommendations.all`) exist for
targeted invalidation.

## Client defaults — `src/app/queryClient.ts`

`staleTime: 60 s`, `gcTime: 10 min`, `refetchOnWindowFocus: true`, `throwOnError: false`
(pages render `ErrorState`), `retry`: only for network/5xx errors and at most twice
(`ApiError` with a 4xx status is final). Devtools are lazy-loaded in development only
(`app/providers.tsx`).

## `staleTime` per resource — `staleTimes` in `queryKeys.ts`

| Query                                      | staleTime                                                    | Why                                                                  |
| ------------------------------------------ | ------------------------------------------------------------ | -------------------------------------------------------------------- |
| `meOptions`                                | `Infinity`                                                   | changes only through login/logout mutations, which set it explicitly |
| `booksListOptions`, `booksInfiniteOptions` | 60 s                                                         | catalog changes rarely for readers; librarian writes invalidate      |
| `bookDetailOptions`                        | 60 s (edit form: `staleTime: 0`, `refetchOnMount: 'always'`) | the edit form must start from the current `version`                  |
| `newestOptions`                            | 5 min                                                        | landing page; invalidated by book create/archive/restore             |
| `genresOptions`                            | 10 min                                                       | taxonomy; invalidated by genre mutations                             |
| `shelfOptions`, `favoritesOptions`         | 30 s                                                         | per-user, mutated optimistically                                     |
| `forYourShelvesOptions`                    | 2 min                                                        | derived from shelf + favourites; invalidated by both                 |
| `ai.status`                                | `Infinity` (Phase 11)                                        | set at boot                                                          |
| `audit.list`                               | 0 (Phase 14 page, if built)                                  | always fresh for the librarian                                       |

## Patterns

### Pagination (`features/catalog/CatalogPage.tsx` → `PagedBooks`)

`useQuery({ ...booksListOptions(params), placeholderData: keepPreviousData })`. While the next
page loads, the previous page stays on screen dimmed with `aria-busy` on the `role="feed"`
grid (`BookGrid`). Once a page settles, the **next page is prefetched** with
`queryClient.prefetchQuery(booksListOptions({ ...params, page: page + 1 }))`. Page, filters,
sort and page size are URL state; changing a filter resets the page (`useCatalogParams`).
`Paginator` renders real links (each page has a URL) and lets React Query own the fetch.

### Infinite scroll (`features/catalog/InfiniteBooks.tsx`)

`useInfiniteQuery(booksInfiniteOptions(query))` with `initialPageParam: 1`,
`getNextPageParam` from `meta.page < meta.totalPages`, and **`maxPages: 8`** — at 24 books
per page that is 192 books, more than the whole seeded catalog (120), so no page is ever
evicted in the demo; on a larger catalog evicted pages are refetched when scrolled back to. An
`IntersectionObserver` sentinel auto-loads the first three pages; after that (or with
`prefers-reduced-motion`, or without `IntersectionObserver`) only the always-rendered **Load
more** button loads more, so the footer stays reachable. Loaded counts are announced through
the polite live region (`lib/announce.ts`). The mode (`pages` | `scroll`) is a persisted
`uiStore` preference, not URL state.

### Prefetch on hover/focus (`features/catalog/queries.ts` → `usePrefetchBookDetail`)

`BookCard` calls `queryClient.prefetchQuery(bookDetailOptions(id))` on `pointerenter`/`focus`
after a 120 ms intent delay (cancelled on leave/blur). `prefetchQuery` is a no-op while the
cached detail is fresher than its `staleTime`, so repeated hovers cost nothing. The detail page
(`features/books/BookDetailPage.tsx`) additionally uses `placeholderData` built from any list,
infinite or newest cache entry (`summaryFromCache`) so title, author and cover paint before
the detail request finishes.

### Optimistic reading-list mutations (`features/shelf/mutations.ts`)

`useAddToShelf`, `useUpdateReadingState`, `useRemoveFromShelf` share `useOptimisticShelf`:
`onMutate` → `cancelQueries(qk.shelf.list)`, snapshot, `setQueryData` with the expected
result (adds use a temporary negative id); `onError` → restore the snapshot and toast the
server message; `onSettled` → `invalidateQueries(qk.shelf.list)` and
`invalidateQueries(qk.recommendations.all)`. "On my shelf" on catalog cards and the detail
page is derived from `shelf.list` (`useShelfIds`), so one cache update covers every view.

### Targeted invalidation after librarian writes (`features/librarian/mutations.ts`)

Book create/update/archive/restore → `setQueryData(qk.books.detail(id), book)` and invalidate
`qk.books.lists`, `qk.books.infinites`, `qk.books.newest`, `qk.genres.all` (active counts),
`qk.shelf.list` (archived banners) and `qk.recommendations.all`. Genre create/rename/
archive/restore → invalidate `qk.genres.all`, `qk.books.all` (genre names are embedded in
summaries), `qk.favorites.list`, `qk.recommendations.all`. There is no
`invalidateQueries()` without a key anywhere; the only global cache operation is
`queryClient.clear()` on logout (`features/auth/queries.ts` → `useLogout`).

### Version conflicts (`features/librarian/BookForm.tsx`, `VersionConflictDialog.tsx`)

A `409 VERSION_CONFLICT` carries the current book in `details.current`. The dialog shows the
latest values and offers "Keep my changes and retry" (the form keeps the librarian's values
and re-submits on top of the new `version`) or "Use the latest version" (reset the form).

### Auth

`useLogin`/`useRegister` set `qk.auth.me` from the response; `RequireAuth`, `RequireRole`
and `RedirectIfAuthed` (`app/guards.tsx`) are layout routes reading that query.

## Authorization split with the API

The web guards (`RequireAuth`, `RequireRole`) only hide pages. The API is authoritative: every
route is declared with `access: 'public' | 'user' | 'librarian'` (`apps/api/src/lib/route.ts`,
generic over access so handlers get a typed `actor`), and every mutating service method calls
`authorize(actor, role)` once at the top (`apps/api/src/lib/authz.ts`), so the same rule holds
for callers that bypass HTTP.

## Routing — `src/app/router.tsx`

`createBrowserRouter` with `AppShell` as the root layout (skip link, header, `<main id="main">`,
footer, toaster), every page loaded through `lazy`, guards as layout routes, and a `*` route.
Paths live in `app/routes.ts`. The `page()` helper in `router.tsx` loads a route's chunk and its
translation namespaces together, so a page never renders with a missing key.

## Internationalisation — `src/i18n/`

English and French (Arabic is a query language, not a UI language; `dir="auto"` keeps Arabic
titles readable). `react-i18next` with one JSON namespace per feature under
`src/locales/<lng>/<ns>.json`; `i18n/index.ts` registers a 10-line lazy backend (a namespace is a
dynamic import, so each language/namespace is its own Vite chunk) and each route lists the
namespaces it needs. Key types are generated from the English JSON (`i18n/i18next.d.ts` augments
`CustomTypeOptions`), so a key that is not in the file is a type error; `i18n.test.ts` asserts the
`en` and `fr` key sets and interpolation variables are identical per namespace.

- **Language preference**: `uiStore.locale` (persisted; default from `navigator.language`), set by
  the header's `<select>`; `useLocaleSync()` in `Providers` applies it to i18next, `<html lang>`
  and Zod (`i18n/zod.ts` swaps `z.config(fr())` so form messages follow the UI language).
- **Domain vocabulary**: `domain.labels` is `Record<'en' | 'fr', DomainLabels>`; `useLabels()`
  returns the current language's record. Sentences interpolate labels
  (`t('nav.manage', { what: labels.items })`) rather than concatenating.
- **Formatting**: `useFormat()` wraps `Intl.NumberFormat`/`Intl.DateTimeFormat` for the current
  language (ratings `4.5` → `4,5` in French).
- **API errors**: `describeError(error)` translates by the contract's `ApiErrorCode`
  (`common:errors.<CODE>`); the server's `message` is never shown. `pageStates.test.tsx` asserts
  the server wording does not reach the page.
- **Tests** initialise the same instance synchronously with every bundle (`test/i18n.ts`), reset to
  English after each test, and render every page in French (`i18n/pages.fr.test.tsx`).

## AI features — `src/features/ai/`

`useAiStatus()` (staleTime `Infinity`) gates every AI surface: a feature renders only when
`/ai/status.features` says it is on, and `AiStatusBadge` names each tier's provider and model.
AI calls are mutations, not queries — nothing model-generated is cached client-side. The
natural-language search bar (`NaturalSearchBar` + `QueryChips`) never searches by itself: it
turns text into editable chips and **Apply** writes them through `useCatalogParams`, so the
URL stays the single source of the catalog query. `503 AI_UNAVAILABLE` (`isAiUnavailable`)
means: apply the text as a plain `q`, show `AiFallbackNotice`, never an error page.

Librarian autofill (`features/librarian/AutofillPanel.tsx`, new-book form only) follows the
same rule: `autofillBook()` returns a draft whose every field names its source (From Open
Library, As typed, Suggested by AI, Not found; low-confidence AI values say "check this"), and
**Use these values** only calls `form.setValue` — the librarian still submits the form. The
endpoint answers 200 even when the model is down (`meta.aiUnavailable`: the draft is
lookup-only, with `AiFallbackNotice`).

## Constants

API paths come from `@library/contracts` (`API_PREFIX`, `apiPaths.books.detail(id)` …), so the
web, the API routers, MSW handlers and the e2e helpers agree by construction; audit actions, cookie
and header names live in the same `constants.ts` (shared) and `apps/api/src/config/constants.ts`
(API-only), and a grep test in the API fails on any stray literal.

## Accessibility notes (finished in Phase 9)

Skip link; one `:focus-visible` style; 44 px minimum on every control (`base.css`); native
`<dialog>` via `showModal()` (focus trap, Esc, focus return) as the one modal primitive;
`role="feed"` + `aria-busy` on grids; polite/assertive live regions for toasts and result
counts; `dir="auto"` on titles, authors, synopses and the search input so Arabic titles read
correctly; `prefers-reduced-motion` disables the auto-loading sentinel and all transitions;
`forced-colors` keeps borders and focus visible; fonts are bundled locally (see "Interface").

## Interface — tokens, fonts, motion, the big pieces

The visual system (tokens, type, covers, components, do/don't) is documented in
`docs/design-system.md`; this section is where the code lives.

- **Tokens and themes**: `styles/tokens.css` (dark by default, `data-theme` from the persisted
  toggle, a `.cover-stage` scope for heroes, a `.paper` scope for the open book, slips and the
  library card, a `.call-dark` scope for the call). `scripts/contrast.mjs` checks every pair.
- **Fonts**: bundled with `@fontsource-variable/geist` (everything), `@fontsource-variable/geist-mono`
  (data: ISBNs, years, scores, timers, keyboard hints) and the Arabic subset of
  `@fontsource/ibm-plex-sans-arabic` (500, 700). No font requests leave the app.
- **Covers**: `components/BookCover.tsx` + `lib/cover.ts` + `styles/cover.css` — DOM and CSS,
  colors and shape from stable hashes of the title (`packages/domain-config` palette).
- **The open book** (`features/books`): `BookDetailPage` renders the spread (left: the inside
  of the front board with `LibraryCard`; right: the paper page), one page under 680 px of page
  width (a container query in `styles/book.css`). `useBookOpen` plays the open/close timelines.
  Covers on app pages call `recordBookOpen` (`stores/bookOpenStore.ts`) on click; the page reads
  that origin once (PUSH navigations only) and clears it.
- **Motion**: `lib/motion.ts` is the only module that imports GSAP; it registers `useGSAP`,
  `Flip` and `SplitText` once and holds every duration and ease. Entry-chunk code uses
  `lib/motionPrefs.ts` (media queries, `loadMotion()`, `loadedMotion()`, the headline helper),
  so GSAP stays a lazy chunk. Six moments: book open/close, Flip (`components/FlipGroup.tsx`, a
  class component for `getSnapshotBeforeUpdate`), the signed-out headline (once per session),
  the orb (`features/call/Orb.tsx` → `driveOrb`), the ⌘K open/close, stamps
  (`components/Stamp.tsx`). Everything runs inside `gsap.matchMedia`; reduced motion reaches
  the same end state without movement.
- **⌘K command menu** (`features/command`): `CommandMenuHost` (entry chunk) listens for the
  shortcut and lazy-loads `CommandMenu` (cmdk inside our `Dialog`, variant `command`). Books
  come from `booksListOptions` (debounced); choosing one shows Open / Add to Want to read / Add
  to Reading, which use the optimistic shelf mutations.
- **Catalog layout** (`features/catalog/BookTable.tsx`): `BookResults` renders the cover grid
  (inside a `FlipGroup`) or the dense table, from `catalogLayout` (persisted, separate from
  pages/scroll); under 768 px only covers. During a search by meaning each row offers "Why it
  matched" (`WhyItMatched.tsx`), from the optional `match` field of the hybrid search response.
- **Chat drawer** (`features/ai`): `ChatHost` loads the drawer on first open and keeps it
  mounted; `ChatPanel` (the librarian's desk), `formatAnswer` (the light Markdown models write,
  as React elements), `ShelfAnswer` (cited
  books as a shelf), `PendingActionCard` (the reading list slip, stamped on Confirm), starters
  from the reader's own list, dictation in `useDictation`.
- **Activity** (`features/librarian/ActivityPage.tsx`, librarians): the audit log as sentences
  (`GET /audit-logs`, which names the actor and the thing changed via the optional `actor` and
  `entityLabel` fields), filter and page as URL state, changed fields in a `<details>`.
- **Checks**: Playwright projects `chromium` (desktop, reduced motion), `mobile` (390 × 844,
  touch), `motion` (animations on, no console errors), `voice` (fake mic), `forced-colors`,
  `reduced-motion`; axe on every page in both themes, on desktop and on the phone.
  `scripts/lighthouse.mjs` compares desktop and mobile scores with `lighthouse-baseline.json`.
- **The call** (`features/call`): `callSession.ts` owns the socket and the audio graph (a module
  singleton, so the call survives navigation) and exposes the analyser levels the orb reads;
  `CallLayer` shows `CallScreen` (full screen, always dark) or `CallPill` (minimized), both
  loaded with the first call.
- **Forms**: `i18n/zodResolver.ts` (react-hook-form's resolver with translated codes) is imported
  by the forms only; `i18n/zod.ts` (the Zod locale, loaded everywhere) stays free of it.
