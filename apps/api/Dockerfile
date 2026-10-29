# syntax=docker/dockerfile:1
# Obraz serwera API i workera kolejki. Budowany z katalogu głównego repozytorium:
#   docker build -f apps/api/Dockerfile .

FROM node:24-alpine AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter "@game/api..."
RUN pnpm exec turbo run build --filter=@game/api
RUN pnpm deploy --filter=@game/api --prod --legacy /out

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
