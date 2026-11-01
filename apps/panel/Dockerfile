# syntax=docker/dockerfile:1
# Kancelaria: API personelu. Budowany z katalogu głównego repozytorium.
#   docker build -f apps/panel/Dockerfile .

FROM node:24-alpine AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter "@game/panel..."
RUN pnpm exec turbo run build --filter=@game/panel
RUN pnpm deploy --filter=@game/panel --prod --legacy /out

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
# Migracje gry leżą poza paczką panelu. Ścieżka: dist/server → ../../drizzle.
COPY --from=build --chown=node:node /repo/apps/api/drizzle ./drizzle
USER node
EXPOSE 3210
CMD ["node", "dist/server/main.js"]
