# ── Stage 1: Builder ─────────────────────────────────────────────────────────
FROM node:24-slim AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /workspace

# Copy workspace manifests
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY tsconfig.base.json tsconfig.json ./

# Copy lib packages (api-client-react provides generated hooks for the frontend)
COPY lib/ ./lib/

# Copy frontend app
COPY artifacts/lealcert/ ./artifacts/lealcert/

# Install all dependencies
RUN pnpm install --frozen-lockfile --ignore-scripts

# Build lib packages
RUN pnpm run typecheck:libs

# Build the Vite app (output → artifacts/lealcert/dist/public)
RUN BASE_PATH=/ NODE_ENV=production pnpm --filter @workspace/lealcert run build

# ── Stage 2: Nginx ────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /workspace/artifacts/lealcert/dist/public /usr/share/nginx/html

EXPOSE 80
