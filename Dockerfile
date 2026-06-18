# ============================================================
# LealCert — Multi-stage Dockerfile
# Targets: api (Node.js) e web (Nginx + frontend estático)
# ============================================================

# ── Stage 1: instalar dependências + build ──────────────────
FROM node:24-alpine AS builder

RUN npm install -g pnpm@10 --silent

WORKDIR /app

# Copiar arquivos de configuração do workspace
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY tsconfig.base.json tsconfig.json ./

# Copiar todos os pacotes do monorepo
COPY lib/              ./lib/
COPY artifacts/api-server/ ./artifacts/api-server/
COPY artifacts/lealcert/   ./artifacts/lealcert/
COPY scripts/          ./scripts/

# Instalar todas as dependências
RUN pnpm install --frozen-lockfile

# Compilar libs compartilhadas
RUN pnpm run typecheck:libs

# Compilar API
RUN pnpm --filter @workspace/api-server run build

# Compilar frontend (BASE_PATH=/ para domínio raiz)
ENV BASE_PATH=/ PORT=3000
RUN pnpm --filter @workspace/lealcert run build


# ── Stage 2: imagem de produção da API ─────────────────────
FROM node:24-alpine AS api

RUN apk add --no-cache dumb-init && \
    npm install -g pnpm@10 --silent

WORKDIR /app

# Copiar estrutura necessária para dependências de runtime
COPY --from=builder /app/pnpm-workspace.yaml /app/package.json /app/pnpm-lock.yaml ./
COPY --from=builder /app/tsconfig.base.json /app/tsconfig.json ./
COPY --from=builder /app/lib/ ./lib/
COPY --from=builder /app/scripts/ ./scripts/
COPY --from=builder /app/artifacts/api-server/package.json ./artifacts/api-server/
COPY --from=builder /app/artifacts/api-server/dist/         ./artifacts/api-server/dist/

# Instalar somente dependências de produção
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080
WORKDIR /app/artifacts/api-server

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "--enable-source-maps", "./dist/index.mjs"]


# ── Stage 3: imagem Nginx servindo o frontend ───────────────
FROM nginx:1.27-alpine AS web

COPY --from=builder /app/artifacts/lealcert/dist/public/ /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
