# ── Stage 1: Builder ─────────────────────────────────────────────────────────
FROM node:24-slim AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /workspace

# Copy workspace manifests first (better layer caching)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY tsconfig.base.json tsconfig.json ./

# Copy all lib packages
COPY lib/ ./lib/

# Copy api-server
COPY artifacts/api-server/ ./artifacts/api-server/

# Install all dependencies (workspace-aware)
RUN pnpm install --frozen-lockfile --ignore-scripts

# Build lib packages (generates .d.ts declarations)
RUN pnpm run typecheck:libs

# Build the api-server bundle (esbuild → dist/)
RUN pnpm --filter @workspace/api-server run build

# ── Stage 2: Production ───────────────────────────────────────────────────────
FROM node:24-slim

WORKDIR /app

# Copy the self-contained esbuild bundle (includes pino workers)
COPY --from=builder /workspace/artifacts/api-server/dist ./dist

# Copy database migrations (applied automatically on startup)
COPY --from=builder /workspace/artifacts/api-server/migrations ./migrations

# Install externalized runtime packages not bundled by esbuild
RUN npm install --save nodemailer

# Create upload directory (persisted via Docker volume)
RUN mkdir -p uploads/chat-docs

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
