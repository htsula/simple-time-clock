# Standalone container: built frontend + api/ handlers + persistent PGlite.
# Node 24 is REQUIRED — server.mjs relies on native TypeScript type stripping
# to run the api/*.ts handlers directly.

# --- build stage -----------------------------------------------------------
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- runtime stage -----------------------------------------------------------
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production \
    PGLITE_DATA_DIR=/data \
    PORT=3000

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY api ./api
COPY db ./db
COPY scripts/lib ./scripts/lib
COPY server.mjs ./

EXPOSE 3000
VOLUME /data

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://localhost:3000/').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["node", "server.mjs"]
