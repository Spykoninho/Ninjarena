# syntax=docker/dockerfile:1
# Deux cibles: `web` (client statique derrière nginx) et `server` (serveur WebSocket Node).

FROM node:22.23.2-alpine AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/client/package.json packages/client/
COPY packages/content/package.json packages/content/
COPY packages/core/package.json packages/core/
COPY packages/protocol/package.json packages/protocol/
COPY packages/server/package.json packages/server/

FROM base AS build
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @ninjarena/server build && pnpm --filter @ninjarena/client build

# Dépendances d'exécution du serveur seulement: pas de toolchain dans l'image finale.
FROM base AS server-deps
RUN pnpm install --frozen-lockfile --prod --filter @ninjarena/server

FROM nginx:1.29-alpine AS web
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/packages/client/dist /usr/share/nginx/html/ninjarena
EXPOSE 80

FROM node:22.23.2-alpine AS server
ENV NODE_ENV=production
WORKDIR /app/packages/server
COPY --from=server-deps /app/node_modules /app/node_modules
COPY --from=server-deps /app/packages/server/node_modules ./node_modules
COPY --from=build /app/packages/server/dist ./dist
# Le volume des cartes hérite du propriétaire de ce dossier à sa création.
RUN mkdir -p /data/maps && chown node:node /data/maps
USER node
EXPOSE 8080
CMD ["node", "dist/main.js"]
