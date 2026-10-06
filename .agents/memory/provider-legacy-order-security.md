---
name: Legacy provider order authorization
description: Why unmapped provider orders must remain admin-only, while pre-purchase identity checks stay available.
---

Pedidos existentes apenas no provedor, sem vínculo local verificável, devem permanecer acessíveis somente a administradores. Não liberar a consulta ou operação por CPF/CNPJ, atribuição de atendimento ou contador informado pelo navegador.

**Why:** Um titular pode ter pedidos em escritórios diferentes. Conhecer o documento ou o identificador externo não comprova propriedade; negar pedidos sem vínculo local é uma decisão de segurança, não uma falha de integração a contornar.

**How to apply:** Em futuras rotas legadas, exigir vínculo local e autorização do escritório antes de chamar o provedor. Listagens de um titular precisam autorizar cada pedido, não apenas o titular. Manter separadas as consultas prévias legítimas de CPF/CNPJ e PSBio, necessárias antes de existir um pedido.
