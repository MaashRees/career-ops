# Image de production — contexte de build = ce dossier (platform/).
#   docker build -t chasseur-emploi .
#   docker run -p 3000:3000 --env-file .env chasseur-emploi
# La configuration (clés Supabase, clés IA…) est lue AU DÉMARRAGE : aucune clé n'est
# écrite dans l'image.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /app
ENV BUILD_STANDALONE=1 NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
# Prompts du moteur lus à l'exécution (engine/modes/*.md).
COPY --from=build --chown=node:node /app/engine ./engine
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1 || exit 1
CMD ["node", "server.js"]
