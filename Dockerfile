# ============================================================
# LealCert — Multi-stage Dockerfile
# Targets: api (Node.js) e web (Nginx + frontend estático)
# ============================================================

# ── Stage 1: instalar dependências + build ──────────────────
FROM node:24.22.1-bookworm-slim AS builder

RUN npm install -g pnpm@10 --silent

WORKDIR /app

# Copiar arquivos de configuração do workspace
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY tsconfig.base.json tsconfig.json ./

# Copiar apenas os package.json de cada pacote para cachear o install
COPY lib/db/package.json                          ./lib/db/
COPY lib/api-spec/package.json                    ./lib/api-spec/
COPY lib/api-zod/package.json                     ./lib/api-zod/
COPY lib/api-client-react/package.json            ./lib/api-client-react/
COPY lib/integrations-openai-ai-react/package.json  ./lib/integrations-openai-ai-react/
COPY lib/integrations-openai-ai-server/package.json ./lib/integrations-openai-ai-server/
COPY scripts/package.json                         ./scripts/
COPY artifacts/api-server/package.json            ./artifacts/api-server/
COPY artifacts/lealcert/package.json              ./artifacts/lealcert/

# Instalar todas as dependências — esta camada é cacheada enquanto o lockfile não mudar
RUN pnpm install --frozen-lockfile

# Agora copiar o código fonte
COPY lib/              ./lib/
COPY artifacts/api-server/ ./artifacts/api-server/
COPY artifacts/lealcert/   ./artifacts/lealcert/
COPY scripts/          ./scripts/

# Compilar libs compartilhadas
RUN pnpm run typecheck:libs

# Compilar API
RUN pnpm --filter @workspace/api-server run build

# Compilar frontend (BASE_PATH=/ para domínio raiz)
ENV BASE_PATH=/ PORT=3000
RUN pnpm --filter @workspace/lealcert run build


# ── Stage 2: imagem de produção da API ─────────────────────
FROM node:24.22.1-bookworm-slim AS api

RUN apt-get update && \
    apt-get install -y --no-install-recommends dumb-init && \
    rm -rf /var/lib/apt/lists/* && \
    npm install -g pnpm@10 --silent

WORKDIR /app

# Copiar estrutura necessária para dependências de runtime
COPY --from=builder /app/pnpm-workspace.yaml /app/package.json /app/pnpm-lock.yaml ./
COPY --from=builder /app/tsconfig.base.json /app/tsconfig.json ./
COPY --from=builder /app/lib/ ./lib/
COPY --from=builder /app/scripts/ ./scripts/
COPY --from=builder /app/artifacts/api-server/package.json ./artifacts/api-server/
COPY --from=builder /app/artifacts/api-server/dist/         ./artifacts/api-server/dist/
COPY --from=builder /app/artifacts/api-server/migrations/   ./artifacts/api-server/migrations/

# Instalar somente dependências de produção
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

RUN groupadd --system --gid 1001 appuser && \
    useradd --system --uid 1001 --gid 1001 --home-dir /app --shell /usr/sbin/nologin appuser && \
    mkdir -p /app/uploads/cnh /app/uploads/cartao-cnpj /app/uploads/ficha-cadastral /app/uploads/chat-docs && \
    chown -R 1001:1001 /app/uploads

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080
WORKDIR /app/artifacts/api-server
USER 1001:1001

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "--enable-source-maps", "./dist/index.mjs"]


# ── Stage 3: imagem Nginx servindo o frontend ───────────────
FROM nginx:1.27-alpine AS web

COPY --from=builder /app/artifacts/lealcert/dist/public/ /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
