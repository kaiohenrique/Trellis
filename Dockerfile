# syntax=docker/dockerfile:1.7

# -----------------------------------------------------------------------------
# Trellis — multi-stage build.
#
# Stage 1 (build): install all workspace deps, compile the React client.
# Stage 2 (runtime): minimal node image with built client + server source.
#                    Uses tsx at runtime so we don't need to chase TypeScript
#                    path-alias rewrites at compile time.
# -----------------------------------------------------------------------------

# ============================================================================
# Stage 1 — build
# ============================================================================
FROM node:20-alpine AS build

WORKDIR /app

# Copy lockfiles and workspace manifests first so npm ci can cache.
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
COPY client/package.json ./client/

# Install all deps (dev + prod) for every workspace. Lockfile is the source of truth.
RUN npm ci

# Copy the rest of the source.
COPY tsconfig.base.json ./
COPY shared/ ./shared/
COPY server/ ./server/
COPY client/ ./client/

# Build the client into client/dist (Express serves this in production).
RUN npm run build -w client

# ============================================================================
# Stage 2 — runtime
# ============================================================================
FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    KB_PORT=3000 \
    KB_MCP_ENABLED=true

# Bring the resolved node_modules from the build stage (already includes tsx).
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json /app/package-lock.json ./

# Server source + shared types — runtime executes via tsx.
COPY --from=build /app/shared ./shared
COPY --from=build /app/server ./server
COPY --from=build /app/tsconfig.base.json ./

# Built client (Express serves this as static + SPA fallback).
COPY --from=build /app/client/package.json ./client/
COPY --from=build /app/client/dist ./client/dist

EXPOSE 3000

# Small startup health check so docker can mark unhealthy if the API never came up.
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:${KB_PORT}/health || exit 1

# Use the workspace-aware start script so we run under server/.
CMD ["npm", "run", "start", "-w", "server"]
