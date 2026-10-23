---
name: Docker production build
description: Requisitos de compatibilidade para gerar as imagens web e API do LealCert.
---

O builder Docker deve usar uma base Node Debian/glibc, não Alpine/musl, e o PWA deve permitir precache de pelo menos 3 MiB.

**Why:** o lockfile exclui binários Rollup para musl, então a build Alpine falha. Além disso, o bundle principal ultrapassa o limite padrão de 2 MiB do plugin PWA, que encerra a build mesmo após o Vite gerar os arquivos.

**How to apply:** antes de alterar o deploy do EasyPanel, valide os targets web e API com uma build Docker local completa; typecheck isolado não detecta esses dois bloqueios de imagem.

Em rebuilds de segurança do Node, manter a linha LTS existente e fixar a versão de correção confirmada na publicação oficial em todas as variantes Docker.

**Why:** A correção deve ser auditável e não pode virar uma migração de versão principal nem depender de uma base antiga em cache.

**How to apply:** Reconstruir com `--pull`, invalidar o cache quando for solicitado rebuild completo e conferir `node --version` dentro da imagem da API. Build local não comprova atualização da VPS.