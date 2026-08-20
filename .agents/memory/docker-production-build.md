---
name: Docker production build
description: Requisitos de compatibilidade para gerar as imagens web e API do LealCert.
---

O builder Docker deve usar uma base Node Debian/glibc, não Alpine/musl, e o PWA deve permitir precache de pelo menos 3 MiB.

**Why:** o lockfile exclui binários Rollup para musl, então a build Alpine falha. Além disso, o bundle principal ultrapassa o limite padrão de 2 MiB do plugin PWA, que encerra a build mesmo após o Vite gerar os arquivos.

**How to apply:** antes de alterar o deploy do EasyPanel, valide os targets web e API com uma build Docker local completa; typecheck isolado não detecta esses dois bloqueios de imagem.