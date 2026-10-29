# syntax=docker/dockerfile:1
# Statyczny build PWA serwowany przez nginx, który przekazuje /api do kontenera `api`.
#   docker build -f apps/web/Dockerfile .

FROM node:24-alpine AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter "@game/web..."
RUN pnpm exec turbo run build --filter=@game/web

FROM nginx:1-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
