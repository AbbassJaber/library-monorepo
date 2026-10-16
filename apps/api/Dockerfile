# syntax=docker/dockerfile:1.7
# Build context is the repository root (see compose.yaml); .dockerignore is an allow-list.
#
# Three stages:
#   build   — everything installed, API + workspace packages compiled (also the Prisma CLI).
#   migrate — the build stage with an entrypoint that applies migrations and seeds; runs once
#             per `docker compose up` as the `migrate` service and exits.
#   runtime — Alpine + production dependencies + compiled output. No Prisma CLI (its tree is
#             ~200 MB of studio/pglite/typescript), no TypeScript, no dev tooling.

# Build-arg before the first FROM so it is global (used by the runtime stage's FROM).
ARG RUNTIME_BASE=node:22-alpine

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.23.0 --activate
WORKDIR /repo

# ---- build ----
FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/mcp/package.json apps/mcp/
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/contracts/package.json packages/contracts/
COPY packages/domain-config/package.json packages/domain-config/
COPY packages/ai/package.json packages/ai/
COPY packages/ai-eval/package.json packages/ai-eval/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY . .
# prisma.config.ts resolves DATABASE_URL on every CLI command, including `generate`
# (which never connects); a placeholder satisfies it at build time.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN pnpm --filter @library/api exec prisma generate \
 && pnpm turbo run build --filter=@library/api...

# ---- migrate: one-shot `prisma migrate deploy` + seed ----
FROM build AS migrate
ENV NODE_ENV=production
WORKDIR /repo/apps/api
RUN chmod +x docker-migrate.sh
USER node
ENTRYPOINT ["./docker-migrate.sh"]

# ---- runtime ----
# Default: Alpine, mock/Bedrock embeddings, no ONNX (273 MB). For EMBEDDING_PROVIDER=local build
# with WITH_LOCAL_EMBEDDINGS=true and a glibc base (onnxruntime-node ships glibc binaries that
# do not run on musl):  WITH_LOCAL_EMBEDDINGS=true API_RUNTIME_BASE=node:22-bookworm-slim docker compose build api
FROM ${RUNTIME_BASE} AS runtime
ARG WITH_LOCAL_EMBEDDINGS=false
ENV WITH_LOCAL_EMBEDDINGS=$WITH_LOCAL_EMBEDDINGS
ENV NODE_ENV=production
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.23.0 --activate
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/contracts/package.json packages/contracts/
COPY packages/domain-config/package.json packages/domain-config/
COPY packages/ai/package.json packages/ai/
COPY apps/api/scripts/prune-peers.mjs apps/api/scripts/prune-peers.mjs
# Install, drop the peer-only Prisma CLI tree (see scripts/prune-peers.mjs), then drop pnpm
# itself: nothing at runtime installs anything.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --prod --filter @library/api... \
 && node apps/api/scripts/prune-peers.mjs /repo \
 && rm -rf /root/.cache /root/.npm /pnpm/bin /pnpm/pnpm /pnpm/*.json /usr/local/lib/node_modules/corepack
COPY --from=build /repo/packages/contracts/dist packages/contracts/dist
COPY --from=build /repo/packages/domain-config/dist packages/domain-config/dist
COPY --from=build /repo/packages/ai/dist packages/ai/dist
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY apps/api/docker-entrypoint.sh apps/api/docker-entrypoint.sh
RUN chmod +x apps/api/docker-entrypoint.sh
# Local-embedding model cache (EMBEDDING_PROVIDER=local); a named volume keeps it across restarts.
RUN mkdir -p /models && chown node:node /models
WORKDIR /repo/apps/api
EXPOSE 4000
USER node
ENTRYPOINT ["./docker-entrypoint.sh"]
