#!/usr/bin/env bash
# =============================================================================
#  setup-vps.sh — Configuração inicial do VPS (rodar UMA VEZ no servidor)
#
#  Execute este script diretamente no VPS via SSH:
#    ssh root@SEU_VPS "bash -s" < docker/setup-vps.sh
# =============================================================================

set -euo pipefail

echo "🔧 Configurando VPS para LealCert..."

# Criar diretório do projeto
mkdir -p /opt/lealcert
cd /opt/lealcert

# Criar arquivo .env se não existir
if [ ! -f .env ]; then
  cat > .env << 'ENVEOF'
# !! EDITE ESTE ARQUIVO COM SUAS CONFIGURAÇÕES !!
DOCKER_HUB_USER=seu_usuario_dockerhub
DB_USER=lealcert
DB_PASSWORD=TROQUE_POR_SENHA_FORTE
SESSION_SECRET=TROQUE_POR_CHAVE_SECRETA
TAG=latest
ENVEOF
  echo "📝 Arquivo .env criado em /opt/lealcert/.env"
  echo "   ⚠️  EDITE o arquivo antes de continuar: nano /opt/lealcert/.env"
fi

echo ""
echo "✅ VPS pronto!"
echo ""
echo "Próximos passos:"
echo "  1. Edite /opt/lealcert/.env com suas variáveis"
echo "  2. No Replit: configure os Secrets e execute ./deploy.sh"
echo "  3. No VPS, após o primeiro deploy:"
echo "     cd /opt/lealcert && docker compose up -d"
echo "  4. Migrar banco: docker compose exec api node dist/index.mjs migrate"
echo ""
