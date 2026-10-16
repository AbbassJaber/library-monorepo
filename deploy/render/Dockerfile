# One service for Render: the API serves the built web app, and the container applies
# migrations and seeds before it starts (the free plan has no separate pre-deploy step).
# Build context is the repository root. The local Compose images are unchanged.

FROM node:22-bookworm-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.23.0 --activate
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/mcp/package.json apps/mcp/
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/contracts/package.json packages/contracts/
COPY packages/domain-config/package.json packages/domain-config/
COPY packages/ai/package.json packages/ai/
COPY packages/ai-eval/package.json packages/ai-eval/
RUN pnpm install --frozen-lockfile
COPY . .
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN pnpm --filter @library/api exec prisma generate \
 && pnpm turbo run build --filter=@library/api... --filter=@library/web...

# The API's dependencies including its dev tools, so the Prisma CLI can migrate at start.
# Local embeddings (onnxruntime) are dropped: this service uses the mock or Bedrock.
FROM node:22-bookworm-slim AS runtime
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
RUN pnpm install --frozen-lockfile --filter @library/api... \
 && rm -rf /pnpm/store /root/.cache /root/.npm \
    node_modules/.pnpm/onnxruntime-* node_modules/.pnpm/@xenova+transformers*
COPY --from=build /repo/packages/contracts/dist packages/contracts/dist
COPY --from=build /repo/packages/domain-config/dist packages/domain-config/dist
COPY --from=build /repo/packages/ai/dist packages/ai/dist
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY --from=build /repo/apps/web/dist /repo/web
COPY apps/api/prisma apps/api/prisma
COPY apps/api/prisma.config.ts apps/api/prisma.config.ts
COPY deploy/render/start.sh /repo/start.sh
COPY deploy/render/migrations-up-to-date.mjs apps/api/migrations-up-to-date.mjs
RUN chmod +x /repo/start.sh && chown -R node:node /repo
ENV NODE_ENV=production
ENV WEB_DIST_DIR=/repo/web
WORKDIR /repo/apps/api
USER node
ENTRYPOINT ["/repo/start.sh"]
