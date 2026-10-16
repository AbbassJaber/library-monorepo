# Running and configuring

The [README](../README.md) covers the 60-second Docker start. This page has the rest.

## Without Docker for the app

```sh
docker compose up -d --wait db
cp apps/api/.env.example apps/api/.env
pnpm install                     # also generates the Prisma client
pnpm db:migrate && pnpm db:seed
pnpm dev                         # API on 4000, web on 5173 (proxies /api)
```

Node 22.22+ and pnpm 10.23 (`corepack enable`) are required.

## AI configuration

Model ids are environment-only; nothing is hard-coded. Pick a provider in `apps/api/.env`
(or the shell, for Compose):

| `AI_PROVIDER`       | Needs                                                  | Notes                                                                 |
| ------------------- | ------------------------------------------------------ | --------------------------------------------------------------------- |
| `mock` (default)    | nothing                                                | Deterministic multilingual parser; what tests and CI gates run on.    |
| `bedrock`           | `AWS_REGION`, AWS credentials, `AI_MODEL_SMALL/STRONG` | Claude through IAM, no vendor key in the app. Measured below.         |
| `kimi`              | `OPENAI_COMPAT_API_KEY`, `AI_MODEL_SMALL/STRONG`       | Moonshot's OpenAI-compatible API; thinking models, automatic caching. |
| `anthropic`         | `ANTHROPIC_API_KEY`, `AI_MODEL_SMALL/STRONG`           | Same code path as Bedrock.                                            |
| `openai-compatible` | `OPENAI_COMPAT_BASE_URL`, `OPENAI_COMPAT_API_KEY`, ids | Any compatible endpoint.                                              |

`EMBEDDING_PROVIDER=bedrock` with `EMBEDDING_MODEL=cohere.embed-multilingual-v3` and
`EMBEDDING_DIMENSIONS=1024` gives real, multilingual semantic search (Titan v2 also works, with no
cutoff; see DECISIONS.md for the comparison);
`mock` (the default) hashes words and trigrams, which is offline and close to lexical.
`pnpm --filter @library/api embed:sync` embeds only changed books (the API also does it on start).
`HYBRID_SEARCH_RERANK` is off: the rerank was measured and did not earn its cost. `HYBRID_MIN_SIMILARITY`
drops weak semantic hits so gibberish finds nothing (calibrated per model; see DECISIONS.md).
`AI_PROVIDER_STRONG` puts the strong tier on another provider, and `<PROVIDER>_MODEL_<TIER>`
(`KIMI_MODEL_STRONG`, …) gives each provider its own ids. `AI_CHAT_TIER` picks the chat agent's
tier: `small` (Haiku) by default, because a turn has to feel interactive (DECISIONS.md). Voice is
`VOICE_PROVIDER=off|mock|nova-sonic` with `VOICE_MODEL`, its own region (`VOICE_AWS_REGION`,
default eu-north-1) and per-user limits (`VOICE_*` in `.env.example`). `GET /api/v1/ai/status` reports
what is configured; `GET /api/v1/ai/runs` (librarians) lists every model call with tokens, cost
and latency. If the provider is down the app keeps working: search falls back to plain text,
autofill to what Open Library found. `apps/api/.env.example` lists every variable with the
confirmed Bedrock ids and prices.

## Use the library from Claude (MCP)

`apps/mcp` serves the same tools as the chat agent over MCP (stdio), logged in as one library
account: a reader gets 8 tools (search, book details, genres, read the reading list, add to /
change / remove from it, and one batch of removals or state changes for books already on it), a
librarian also gets `draftBook`. Build it once (`pnpm --filter @library/mcp build`),
keep the API running (`docker compose up` or `pnpm stack:real`), then point the client at it.

Claude Desktop (`claude_desktop_config.json`, Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "library": {
      "command": "node",
      "args": ["/absolute/path/to/library-monorepo/apps/mcp/dist/server.js"],
      "env": {
        "LIBRARY_API_URL": "http://localhost:4000",
        "LIBRARY_EMAIL": "reader@library.local",
        "LIBRARY_PASSWORD": "Password123!"
      }
    }
  }
}
```

Claude Code:

```sh
claude mcp add library \
  --env LIBRARY_API_URL=http://localhost:4000 \
  --env LIBRARY_EMAIL=reader@library.local --env LIBRARY_PASSWORD='Password123!' \
  -- node "$PWD/apps/mcp/dist/server.js"
```

Changes run as that account when the client approves the tool call (reading-list tools are
marked as not read-only, removal as destructive). `LIBRARY_LOOKUP=fixture` makes `draftBook` use
the recorded Open Library answers (offline). Check a setup with `pnpm --filter @library/mcp smoke`
(drives the server over stdio as both demo accounts) or `pnpm --filter @library/mcp inspect`
(MCP Inspector).

## Try the API with cURL

Every endpoint is under `/api/v1`. A version is a mount point: route modules know only their
resource path, so a v2 would reuse v1's unchanged modules beside it ([DECISIONS.md](../DECISIONS.md)).
Without a browser `Origin` header, login also returns the tokens in the body:

```sh
TOKEN=$(curl -s localhost:4000/api/v1/auth/login -H 'content-type: application/json' \
  -d '{"email":"reader@library.local","password":"Password123!"}' | jq -r .data.accessToken)
curl -s "localhost:4000/api/v1/books?q=tolkein&sort=rating" -H "authorization: Bearer $TOKEN"
curl -s localhost:4000/api/v1/ai/search/parse -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"text":"fantasy from the 90s sorted by rating"}'
# The agent proposes; only the confirm changes the shelf (a second confirm is 409).
ACTION=$(curl -s localhost:4000/api/v1/ai/chat -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"add dune to my reading list"}]}' | jq -r .data.pendingAction.token)
curl -s localhost:4000/api/v1/ai/actions/confirm -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d "{\"token\":\"$ACTION\"}"
```

The browser flow uses httpOnly cookies (15-minute access token, rotating 7-day refresh token):

```sh
O='Origin: http://localhost:8080'; J='content-type: application/json'
curl -s -c jar -H "$O" -H "$J" localhost:4000/api/v1/auth/login \
  -d '{"email":"reader@library.local","password":"Password123!"}'
curl -s -b jar localhost:4000/api/v1/auth/me
curl -s -b jar -c jar -H "$O" -X POST localhost:4000/api/v1/auth/refresh
curl -s -b jar -c jar -H "$O" -X POST localhost:4000/api/v1/auth/logout
```

## Images

| Image                                            | Built from                                                                           | Purpose                                                                                                                          | Size (2026-10-02) |
| ------------------------------------------------ | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `library-monorepo-api`                           | `apps/api/Dockerfile` → `runtime`                                                    | The API server (Alpine, production dependencies only, no Prisma CLI, no ONNX). Gated in CI at 300 MB.                            | 274 MB            |
| `library-monorepo-migrate`                       | `apps/api/Dockerfile` → `migrate`                                                    | One-shot: `prisma migrate deploy` + seed (`SEED_ON_START=always\|if-empty\|never`), exits; `api` waits for it.                   | 1.35 GB           |
| `library-monorepo-web`                           | `apps/web/Dockerfile` (nginx)                                                        | Static web app; proxies `/api/` to the API container.                                                                            | 53 MB             |
| `library-monorepo-api:local-embeddings` (opt-in) | same Dockerfile, `WITH_LOCAL_EMBEDDINGS=true API_RUNTIME_BASE=node:22-bookworm-slim` | The API plus the in-process ONNX stack for `EMBEDDING_PROVIDER=local` (glibc base: onnxruntime does not run on musl). Not gated. | 382 MB            |

The `migrate` image is the full build stage (Prisma CLI, TypeScript, every workspace's dev
dependencies) on purpose: it runs for a few seconds and is never deployed as a service. `scripts/check-image-size.mjs` measures only the
`api` image.
