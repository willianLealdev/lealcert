#!/usr/bin/env bash
# =============================================================================
#  deploy.sh — Publica LealCert no Docker Hub e notifica o Coolify
#
#  Fluxo:
#    1. Carrega chave SSH do Replit Secret (VPS_SSH_KEY)
#    2. Sincroniza o código daqui para o VPS via rsync
#    3. Builda as imagens Docker no VPS (aproveita o cache do servidor)
#    4. Faz push das imagens para o Docker Hub
#    5. Chama o webhook do Coolify para redeployar automaticamente
#
#  Segredos necessários no Replit (Secrets):
#    VPS_HOST            — IP ou hostname do VPS  (ex: 123.456.789.000)
#    VPS_USER            — Usuário SSH             (ex: root)
#    VPS_SSH_KEY         — Conteúdo da chave privada SSH (começa com -----BEGIN)
#    DOCKER_HUB_USER     — Usuário no Docker Hub
#    DOCKER_HUB_PASS     — Senha ou Access Token do Docker Hub
#    DB_PASSWORD         — Senha do PostgreSQL
#    SESSION_SECRET      — Chave de sessão Express
#    COOLIFY_WEBHOOK_API — (opcional) URL do webhook Coolify para a API
#    COOLIFY_WEBHOOK_WEB — (opcional) URL do webhook Coolify para o Web
#    TAG                 — (opcional) tag da imagem, default: latest
# =============================================================================

set -euo pipefail

# ── Verificação de variáveis obrigatórias ──────────────────────────────────
: "${VPS_HOST:?❌  Defina VPS_HOST nos Secrets do Replit}"
: "${VPS_USER:?❌  Defina VPS_USER nos Secrets do Replit}"
: "${VPS_SSH_KEY:?❌  Defina VPS_SSH_KEY nos Secrets do Replit}"
: "${DOCKER_HUB_USER:?❌  Defina DOCKER_HUB_USER nos Secrets do Replit}"
: "${DOCKER_HUB_PASS:?❌  Defina DOCKER_HUB_PASS nos Secrets do Replit}"
: "${DB_PASSWORD:?❌  Defina DB_PASSWORD nos Secrets do Replit}"
: "${SESSION_SECRET:?❌  Defina SESSION_SECRET nos Secrets do Replit}"

TAG="${TAG:-latest}"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   🚀  Deploy LealCert → Docker Hub + Coolify  ║"
echo "╚══════════════════════════════════════════════╝"
echo "  VPS:         ${VPS_USER}@${VPS_HOST}"
echo "  Docker Hub:  ${DOCKER_HUB_USER}/lealcert-api:${TAG}"
echo ""

# ── 1. Configurar chave SSH temporária ─────────────────────────────────────
SSH_KEY_FILE="$(mktemp)"
chmod 600 "$SSH_KEY_FILE"
echo "$VPS_SSH_KEY" > "$SSH_KEY_FILE"

SSH_OPTS="-i $SSH_KEY_FILE -o StrictHostKeyChecking=no -o ConnectTimeout=15"

cleanup() {
  rm -f "$SSH_KEY_FILE"
}
trap cleanup EXIT

# ── 2. Sincronizar código para o VPS ───────────────────────────────────────
echo "📦  [1/4] Sincronizando código..."
rsync -az --delete \
  --exclude '.git' \
  --exclude '.replit' \
  --exclude '.local' \
  --exclude 'attached_assets' \
  --exclude 'node_modules' \
  --exclude '*/node_modules' \
  --exclude '*/dist' \
  --exclude '.env.production' \
  -e "ssh $SSH_OPTS" \
  ./ "${VPS_USER}@${VPS_HOST}:/opt/lealcert/"

echo "✅  Código sincronizado"

# ── 3. Buildar imagens no VPS e fazer push para Docker Hub ─────────────────
echo ""
echo "🔨  [2/4] Buildando imagens no servidor..."

ssh $SSH_OPTS "${VPS_USER}@${VPS_HOST}" bash -s <<REMOTE_SCRIPT
  set -e
  cd /opt/lealcert

  # Login no Docker Hub
  echo "${DOCKER_HUB_PASS}" | docker login -u "${DOCKER_HUB_USER}" --password-stdin 2>/dev/null
  echo "✅  Login Docker Hub OK"

  # Build API
  echo "🔨  Buildando API..."
  docker build \
    --file docker/api.Dockerfile \
    --tag "${DOCKER_HUB_USER}/lealcert-api:${TAG}" \
    --tag "${DOCKER_HUB_USER}/lealcert-api:latest" \
    --cache-from "${DOCKER_HUB_USER}/lealcert-api:latest" \
    . 2>&1 | tail -5
  echo "✅  API buildada"

  # Build Web
  echo "🔨  Buildando Web..."
  docker build \
    --file docker/web.Dockerfile \
    --tag "${DOCKER_HUB_USER}/lealcert-web:${TAG}" \
    --tag "${DOCKER_HUB_USER}/lealcert-web:latest" \
    --cache-from "${DOCKER_HUB_USER}/lealcert-web:latest" \
    . 2>&1 | tail -5
  echo "✅  Web buildada"

  docker logout 2>/dev/null || true
REMOTE_SCRIPT

echo "✅  Imagens buildadas no servidor"

# ── 4. Push para Docker Hub ────────────────────────────────────────────────
echo ""
echo "📤  [3/4] Enviando imagens para Docker Hub..."

ssh $SSH_OPTS "${VPS_USER}@${VPS_HOST}" bash -s <<PUSH_SCRIPT
  set -e
  echo "${DOCKER_HUB_PASS}" | docker login -u "${DOCKER_HUB_USER}" --password-stdin 2>/dev/null
  docker push "${DOCKER_HUB_USER}/lealcert-api:${TAG}"
  docker push "${DOCKER_HUB_USER}/lealcert-api:latest"
  docker push "${DOCKER_HUB_USER}/lealcert-web:${TAG}"
  docker push "${DOCKER_HUB_USER}/lealcert-web:latest"
  docker logout 2>/dev/null || true
  echo "✅  Push concluído"
PUSH_SCRIPT

echo "✅  Imagens no Docker Hub"

# ── 5. Notificar Coolify para redeployar ───────────────────────────────────
echo ""
echo "🔄  [4/4] Notificando Coolify..."

if [ -n "${COOLIFY_WEBHOOK_API:-}" ]; then
  curl -sf --max-time 10 "${COOLIFY_WEBHOOK_API}" > /dev/null \
    && echo "✅  Coolify API notificado" \
    || echo "⚠️   Falha ao notificar Coolify API (verifique a URL)"
else
  echo "ℹ️   COOLIFY_WEBHOOK_API não configurado — pule se usar docker compose direto"
fi

if [ -n "${COOLIFY_WEBHOOK_WEB:-}" ]; then
  curl -sf --max-time 10 "${COOLIFY_WEBHOOK_WEB}" > /dev/null \
    && echo "✅  Coolify Web notificado" \
    || echo "⚠️   Falha ao notificar Coolify Web (verifique a URL)"
fi

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   ✅  Deploy concluído com sucesso!            ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "  Imagens publicadas:"
echo "    docker pull ${DOCKER_HUB_USER}/lealcert-api:${TAG}"
echo "    docker pull ${DOCKER_HUB_USER}/lealcert-web:${TAG}"
echo ""
