# Images de production d'Obsio : une étape de build commune, puis une image par service.
#   docker build --target api|worker|web .
# Le front est construit pour une URL publique donnée (VITE_API_URL, connue au build).

FROM node:25-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
RUN test -n "$VITE_API_URL" || (echo "VITE_API_URL est requis au build" && exit 1)
RUN pnpm build
# Une copie autonome de chaque service, avec ses seules dépendances de production.
RUN pnpm --filter @obsio/api deploy --prod /out/api \
 && pnpm --filter @obsio/worker deploy --prod /out/worker

FROM node:25-alpine AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/api .
USER node
EXPOSE 3000
# Migrations : node dist/db/migrate.js ; ouverture d'un client : node dist/cli/create-organisation.js
CMD ["node", "dist/main.js"]

FROM node:25-alpine AS worker
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/worker .
USER node
CMD ["node", "dist/main.js"]

FROM caddy:2.10-alpine AS web
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
