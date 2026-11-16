# Multi-Stage Dockerfile for SeMF Mobile (Node 20 LTS Alpine)

# --- Stage 1: Build Frontend and Server ---
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies with clean slate
COPY package*.json ./
RUN npm ci

# Copy all source code
COPY . .

# Build Vite client (dist/) and Node Express server (dist-server/)
RUN npm run build

# Prune devDependencies to keep runtime ultra-lean
RUN npm prune --production

# --- Stage 2: Minimal Production Runtime ---
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8090

# Non-root user for maximum container security
USER node

# Copy production artifacts from builder
COPY --chown=node:node --from=builder /app/package.json ./package.json
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/dist-server ./dist-server
COPY --chown=node:node --from=builder /app/data ./data

EXPOSE 8090

# Standard container healthcheck targeting /api/health
HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:8090/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist-server/index.js"]
