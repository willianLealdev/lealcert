---
name: EasyPanel Compose builds
description: Como garantir que deploys EasyPanel publiquem o código do commit atual.
---

O serviço Compose no EasyPanel deve usar `build` com os targets da API e do frontend definidos no Dockerfile. Não dependa apenas de imagens Docker Hub com a tag `latest`.

**Why:** um deploy pode ser marcado como concluído mesmo quando só reinicia as imagens já existentes. Isso deixa a produção em uma build antiga e pode excluir a API do domínio se o container web antigo não tiver o proxy correto.

**How to apply:** em mudanças de infraestrutura, valide o Compose resolvido e, após o deploy, confirme publicamente a data dos arquivos e uma rota `/api` antes de atribuir o problema a cache do Cloudflare.