# ADR 0002 — Version notes and fallbacks

**Status:** accepted (2026-10-01)

## Context

Several dependencies are on majors newer than the builder's training data. Each one is used
because it is the current stable line, but every one has a recorded fallback: if a phase loses
more than 30 minutes to a version-specific problem, switch to the fallback, note it here, and
carry on.

## Pins and fallbacks

| Dependency                    | Pinned  | Fallback | Why pinned this way                                                                            |
| ----------------------------- | ------- | -------- | ---------------------------------------------------------------------------------------------- |
| TypeScript                    | 6.0.3   | 5.9.x    | 7.0 is the native (Go) compiler; `typescript-eslint` 8.71 peers `<6.1`, so 6.0 is the ceiling  |
| Prisma (+ client, adapter-pg) | 7.10.0  | 6.x      | `prisma@latest` on npm is an 8.0 release candidate; 7.10 is the current stable line            |
| react-router                  | 8.4.x   | 7.x      | `react-router-dom` no longer exists; `RouterProvider` comes from `react-router/dom`            |
| Vite                          | 8.3.x   | 7.x      | Rolldown/Oxc based; `server.proxy` unchanged                                                   |
| Vitest                        | 5.0.x   | 4.x      | `test.projects` replaces `workspace`                                                           |
| ESLint                        | 10.x    | 9.x      | Flat config only; `eslint-plugin-jsx-a11y` peer range stops at 9 (allowed via pnpm rules)      |
| Tailwind CSS                  | 4.3.x   | 3.4.x    | CSS-first `@theme`; the fallback would need a JS config                                        |
| Zod                           | 4.6.x   | 3.25.x   | `z.toJSONSchema` is native in 4; the fallback would need `zod-to-json-schema`                  |
| TanStack Query                | 5.104.x | 5.5x     | `queryClient.query()` replaces the deprecated `prefetchQuery`                                  |
| @modelcontextprotocol/sdk     | 1.31.x  | —        | The 2.x line is a different package (`@modelcontextprotocol/server`); 1.x is pinned on purpose |

## TypeScript 6 defaults that every tsconfig sets explicitly

- `types: []` is the default → packages set `"types": ["node"]` (or `["vitest/globals"]`).
- `rootDir` defaults to the tsconfig directory → packages set `"rootDir": "src"`.
- `module: esnext`, `target: es2025` are the defaults → the shared bases set NodeNext / ES2022.
- `baseUrl` and `moduleResolution: node10` are deprecated → not used anywhere.

## Log

- 2026-10-01: initial pins recorded at Phase 1.
- 2026-10-01: Turborepo 2.11 writes an agent-guidance block into `AGENTS.md` when it detects an AI
  agent. `AGENTS.md` is a hand-written project document (agent roles, Phase 14), so
  `"agentGuidance": false` is set in `turbo.json` and the generated file was removed.
- 2026-10-01: `apps/web#build` is a `tsc --noEmit` placeholder until Phase 8 (Turbo warns about
  missing outputs for it; expected).
- 2026-10-01 (Phase 2): Prisma 7 `migrate diff` has no `--shadow-database-url` flag; the
  migrations→schema drift check needs `datasource.shadowDatabaseUrl` in `prisma.config.ts`
  (set only when `SHADOW_DATABASE_URL` is present; `pnpm db:diff`). `prisma generate` also
  requires `DATABASE_URL` to resolve, so the Docker build stage sets a placeholder URL.
- 2026-10-01 (Phase 2): the API compiles with `rootDir: "."` so the seed lands at
  `dist/prisma/seed.js` as planned; the server therefore lives at `dist/src/server.js`
  (`pnpm start`, entrypoint) rather than `dist/server.js`.
- 2026-10-01 (Phase 2): the first `library-monorepo-api` runtime image is **624 MB**
  (`node:22-bookworm-slim` + production `node_modules` of the API and its workspace packages
  - the Prisma CLI for `migrate deploy`). Phase 10 carries a size-reduction item: slim/distroless
    base, `pnpm deploy --prod`, platform-only Prisma engines, target **< 300 MB**.
- 2026-10-01 (Phase 8): MSW 3 renamed `onUnhandledRequest` to `onUnhandledFrame`
  (`server.listen({ onUnhandledFrame: 'error' })`). `eslint-plugin-react-hooks` 7 adds
  `react-hooks/set-state-in-effect`; local input state derived from props uses the
  "adjust state during render" pattern instead of effects. React Router 8 wants a
  `HydrateFallback` on the root route when routes are lazy. Tailwind 4 preflight zeroes
  `dialog` margins — `base.css` restores `margin: auto` so native modals centre.
- 2026-10-01 (Phase 9): Playwright 1.63 ships no Chromium build for macOS 13 ("does not
  support chromium on mac13"). `playwright.config.ts` uses `channel: 'chrome'` (the installed
  system Chrome) on darwin and the bundled Chromium elsewhere (`PLAYWRIGHT_CHANNEL` overrides;
  `PLAYWRIGHT_BROWSERS_PATH=0` keeps CI downloads inside `node_modules`). Programmatic
  `element.focus()` does not match `:focus-visible` in Chrome, so the keyboard tests press
  `Tab` after `page.bringToFront()`; sequential focus only restarts from the top of the
  document after a navigation/reload, never after a click.
- 2026-10-01 (post-Phase 9, i18n): `i18next` 26 and `react-i18next` 17 are newer than the
  builder's training data; checked against the changelogs. i18next 26 removed `initImmediate`
  (`initAsync: false` is the synchronous init used by the test setup) and the legacy
  `interpolation.format` (custom formatters go through `i18n.services.formatter.add`, used for
  `{{word, lowercase}}`). A custom lazy backend is still `{ type: 'backend', read(lng, ns, cb) }`.
  Key typing is `CustomTypeOptions.resources` from `import type … from '*.json'`
  (`resolveJsonModule`); a fixed-namespace `t` does not accept `other:key`, so components that use
  several namespaces call `useTranslation(['own', 'common'])`. Zod 4 ships locales under
  `zod/locales` (`z.config(fr())`); schema-level custom messages still win over the locale map.
- 2026-10-01 (Phase 10, image size): the API runtime image went from **609 MB to 234 MB**.
  Three changes: (1) migrations and the seed moved to a one-shot Compose service `migrate`
  (Dockerfile target `migrate`, built from the `build` stage; `api` waits with
  `service_completed_successfully`), so the runtime needs no Prisma CLI; (2) the runtime base is
  `node:22-alpine` — Prisma 7 with `@prisma/adapter-pg` is pure JS + WASM, no native engine;
  (3) `apps/api/scripts/prune-peers.mjs` runs after `pnpm install --prod`: pnpm keeps the
  peers resolved at lock time, and `@prisma/client` lists `prisma`/`typescript` as optional
  peers, so the CLI's ~220 MB tree (studio, pglite, effect, typescript) still lands in a
  production install. The script walks the real production closure from `pnpm list` and
  deletes everything else, then drops the query-compiler WASM for databases other than
  PostgreSQL (the generated client imports only `query_compiler_fast_bg.postgresql`).
  `scripts/check-image-size.mjs` gates CI at 300 MB. Phase 11 adds the AI SDKs; re-measure.
- 2026-10-01 (Phase 10, CI): `actionlint` is consumed as the npm WASM build
  (`scripts/lint-workflows.mjs`, part of `pnpm lint`) — no Go binary to install, same rules.
  `@vitest/coverage-v8` 5 with per-package `coverage.thresholds` (`pnpm coverage`).
- 2026-10-01 (Phase 11): `@anthropic-ai/sdk` 0.131 / `@anthropic-ai/bedrock-sdk` 0.34 /
  `openai` 7.25 / `@aws-sdk/client-bedrock-runtime` 3.1144 — all behind dynamic imports inside
  provider factories, so importing `@library/ai` loads none of them. `@xenova/transformers` 2.17
  imports `onnxruntime-node` **and** `onnxruntime-web` statically and `sharp` for images; the
  runtime image keeps the packages but deletes the browser WASM/bundles and other-OS binaries
  (`apps/api/scripts/prune-peers.mjs`). onnxruntime-node ships glibc binaries: they fail on
  Alpine even with `libc6-compat` (`Ort::Exception`), so the local-embeddings image variant
  uses `node:22-bookworm-slim` (`API_RUNTIME_BASE` build arg). Default API image: **273 MB**
  (ONNX stack excluded); local-embeddings variant: 382 MB, verified with a real embedding.
  The installed AWS CLI (2.2.14) predates Bedrock; Step 0 therefore ships as a Node script
  (`pnpm --filter @library/ai check:bedrock`) on the SDK.
- 2026-10-01 (Phase 11): Playwright e2e workers capped at 3 (2 in CI): each spec logs in and
  bcrypt (12 rounds ≈ 0.5 s) runs on the API's event loop; more concurrency starves Prisma's
  2 s transaction-start window and shows up as spurious 500s and guard redirects.
- 2026-10-01 (Phase 11 step 0, real calls): what the providers actually do, each now handled
  and covered by a unit test with a fake client —
  - **Bedrock / Anthropic usage**: `input_tokens` _excludes_ cache reads and writes (OpenAI's
    `prompt_tokens` includes them). `tokensIn` is normalised to the total so
    `cost/usage.ts` subtracts the cached parts correctly; before the fix a cache hit priced
    its uncached input at 0.
  - **Bedrock model id**: the response echoes the base id (`anthropic.claude-haiku-4-5-20251001-v1:0`)
    rather than the inference profile that was called (`eu.…`). Results carry the requested id —
    it is what is billed (with the EU geo premium); the echoed one was not even in the price table.
  - **Kimi (kimi-k2.6, kimi-k3)**: thinking models. `400 invalid temperature: only 1 is allowed`
    → the provider adopts the stated value per model and retries once; `400 tool_choice
'specified' is incompatible with thinking enabled` → the documented `auto` + "must call"
    fallback, which Kimi now starts in. Moonshot caches prefixes automatically and reports
    `prompt_tokens_details.cached_tokens` (`cachingSupported: true`). Calls take 2–30 s, so the
    real-provider test suite has a 90 s timeout.
  - **Haiku 4.5 on Bedrock**: forced `tool_choice: {type:'tool'}` works (3/3); prompt caching
    needs ≥ 4,096 tokens _excluding_ the ~590-token tool-use system prompt Anthropic injects.
  - **Sonnet 5.5**: listed `ACTIVE` but `403 not available for this account`; the strong tier
    runs on Kimi K3 via `AI_PROVIDER_STRONG` until access is granted.
  - **Titan v2**: bare id, in-region in eu-central-1, 512 dims verified.
- 2026-10-01 (tests): `listen(0, '127.0.0.1')` binds asynchronously (host lookup), so
  `address()` is `null` for a tick and supertest, seeing no address, binds the wildcard itself
  on the same server. `serve()` now resolves on `'listening'`; this closed the residual HTML 404s
  (matrix 20/20, full API suite 5/5).
- 2026-10-01 (eval, Bedrock quotas): a new account's on-demand Haiku 4.5 quota answers `429 Too
many requests` after a few sequential calls (47 of 68 eval calls on the first run). The app
  keeps failing fast to `AI_UNAVAILABLE` (the UI falls back to plain search); only the eval
  runner retries a 429 with exponential backoff (5 s doubling, 60 s cap, 6 tries) and reports
  the retries per run, so quota never shows up as a quality score.
