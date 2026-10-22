# Imagen de producción (Next.js standalone).
# En Coolify: Build Pack «Dockerfile», Base Directory «/». Volumen persistente en /app/data.

FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

# ── Dependencias (capa en caché mientras no cambie el lockfile)
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ── Build
FROM deps AS build
# Coolify pasa el commit como argumento de build: identifica la versión del despliegue (deploymentId)
ARG SOURCE_COMMIT
ENV SOURCE_COMMIT=${SOURCE_COMMIT}
# Clave fija de las Server Actions: sin ella cada build genera identificadores nuevos y las páginas
# abiertas durante un despliegue fallan con «Failed to find Server Action». Definirla en Coolify como variable de build.
ARG NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
COPY . .
# public/ puede no existir en el repo (Git no guarda carpetas vacías)
RUN mkdir -p public
RUN if [ -z "$NEXT_SERVER_ACTIONS_ENCRYPTION_KEY" ]; then unset NEXT_SERVER_ACTIONS_ENCRYPTION_KEY; fi && pnpm build
# Scripts de mantenimiento empaquetados (la imagen final no tiene tsx ni dependencias de desarrollo)
RUN pnpm exec esbuild scripts/migrate.ts scripts/create-admin.ts \
      --bundle --platform=node --format=esm --target=node24 --outdir=dist-scripts --entry-names=[name] --out-extension:.js=.mjs \
      --external:pg-native \
      --banner:js="import{createRequire}from'node:module';const require=createRequire(import.meta.url);"

# ── Ejecución
FROM node:24-bookworm-slim AS run
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 \
    UPLOAD_DIR=/app/data/uploads MIGRATIONS_DIR=/app/migrations
WORKDIR /app
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/src/db/migrations ./migrations
COPY --from=build --chown=node:node /app/dist-scripts ./scripts
COPY --chown=node:node docker-entrypoint.sh ./
# Carpeta de modelos subidos: montar aquí un volumen persistente
RUN mkdir -p /app/data/uploads && chown -R node:node /app/data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["./docker-entrypoint.sh"]
