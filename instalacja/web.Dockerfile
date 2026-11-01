# syntax=docker/dockerfile:1
# Statyczny build PWA i Kancelarii. nginx serwuje oba i przekazuje /api dalej.
# Kontekst to katalog główny repozytorium:
#   docker build -f instalacja/web.Dockerfile .

FROM node:24-alpine AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter "@game/web..." --filter "@game/panel..."
RUN pnpm exec turbo run build --filter=@game/web --filter=@game/panel

FROM nginx:1-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
COPY --from=build /repo/apps/panel/dist/client /usr/share/nginx/panel
EXPOSE 80 81
