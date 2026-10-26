# Stage 1: Build & Dependencies
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules if required
RUN apk add --no-cache python3 make g++

COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.js ./

# Install all dependencies (including dev for prisma CLI)
RUN npm ci

# Generate Prisma Client (DATABASE_URL required by prisma.config.js for schema validation)
RUN DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" npx prisma generate

# Prune development dependencies
RUN npm prune --omit=dev

# Stage 2: Production Runtime
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000
ENV NODE_OPTIONS="--dns-result-order=ipv4first"

# Install curl/wget for container healthchecks
RUN apk add --no-cache curl wget

# Pre-create uploads and runtime directories with node ownership
RUN mkdir -p /app/uploads/diagnose /app/uploads/diagnoses /app/uploads/audio /app/logs && chown -R node:node /app

# Copy dependencies and generated prisma artifacts
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package*.json ./
COPY --from=builder --chown=node:node /app/prisma ./prisma

# Copy application source code (includes prisma.config.js, src/, etc.)
COPY --chown=node:node . .

# Ensure complete ownership for node user
RUN chown -R node:node /app/uploads /app/logs

# Run as non-root node user
USER node

EXPOSE 5000

# Container Healthcheck Probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:5000/health/liveness || exit 1

CMD ["node", "src/server.js"]
