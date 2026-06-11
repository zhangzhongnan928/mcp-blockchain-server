# syntax=docker/dockerfile:1

# ---- Build stage: compile TypeScript to build/ ----
FROM node:20-alpine AS build
WORKDIR /app
# Install all deps without lifecycle scripts: the `prepare` script builds, but
# the sources aren't present yet at install time.
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Runtime stage: production deps + compiled output only ----
FROM node:20-alpine AS runtime
ENV NODE_ENV=production \
    # A container is a long-running server, so default to the HTTP transport
    # and bind all interfaces. Override any of these at deploy time.
    MCP_TRANSPORT=http \
    HOST=0.0.0.0 \
    PORT=3000
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/build ./build

EXPOSE 3000
# Pending transactions are written under the user's home dir; make it writable.
USER node
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/" >/dev/null 2>&1 || exit 1
CMD ["node", "build/index.js"]
