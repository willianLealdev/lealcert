#!/usr/bin/env bash
# =============================================================================
#  vps-start.sh — Subir os containers no VPS (rodar no servidor)
#
#  Uso: ssh root@VPS "cd /opt/lealcert && bash docker/vps-start.sh"
# =============================================================================

set -euo pipefail

cd /opt/lealcert

echo "🚀 Iniciando LealCert no VPS..."

# Pull das imagens mais recentes do Docker Hub
docker compose pull

# Subir tudo em background
docker compose up -d

echo ""
echo "✅ Containers rodando!"
docker compose ps

echo ""
echo "📋 Ver logs: docker compose logs -f"
echo "🛑 Parar:    docker compose down"
