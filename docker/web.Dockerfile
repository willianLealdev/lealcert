# ── Stage 1: Builder ─────────────────────────────────────────────────────────
FROM node:24.22.1-slim AS builder

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

# Regenerate API hooks from OpenAPI spec (ensures fresh generation even if git-tracked file is stale)
RUN pnpm --filter @workspace/api-spec run codegen

# Build lib packages
RUN pnpm run typecheck:libs

# Build the Vite app (output → artifacts/lealcert/dist/public)
RUN BASE_PATH=/ NODE_ENV=production pnpm --filter @workspace/lealcert run build

# ── Stage 2: Nginx ────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /workspace/artifacts/lealcert/dist/public /usr/share/nginx/html

# Nginx master runs as root (needed to bind port 80) but worker processes drop to nginx user
# This is the standard secure nginx-alpine configuration
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    touch /var/run/nginx.pid && \
    chown nginx:nginx /var/run/nginx.pid

EXPOSE 80
