---
name: Chat order flow — Hope modal + active order card
description: Fixes and features added to the chat widget (landing.tsx) for document upload and scheduling flow.
---

## Hope upload: modal em vez de nova aba
- O botão "Abrir Portal de Documentos" no chat agora abre um Dialog com iframe do Hope (igual ao de `orders/detail.tsx`).
- "Concluir Envio" no modal chama `confirmDocsUploaded()` automaticamente — envia `[DOCS_CONFIRMADOS]` para a IA e mostra o fluxo de agendamento.
- Implementado em: `artifacts/lealcert/src/pages/landing.tsx` — estado `docsModalOpen`, Dialog com iframe.

## Card de pedido ativo no menu inicial do chat
- Ao abrir o chat, `startSession()` faz `GET /api/orders` para verificar pedidos ativos.
- Se encontrar pedido em `["paid", "protocol_assigned", "aguardando_validacao"]`:
  - Seta `activeOrderInfo` (id, orderNumber, status, garHopeUploadUrl, garAgendamentoDataHora)
  - Se `protocol_assigned` + `garHopeUploadUrl` → também seta `hopeUrl` (botão de docs fica disponível imediatamente)
- Card aparece ANTES das 3 opções do menu (Comprar / Suporte / Dúvidas) e mostra:
  - "📄 Enviar Documentos" → abre o modal Hope (se docs pendentes)
  - "📅 Agendar Atendimento" → link para `/orders/{id}` (se protocol_assigned ou aguardando_validacao)
  - Data/hora do agendamento se já estiver confirmado
- Estado `activeOrderInfo`, `hopeUrl`, `docsConfirmed` são resetados ao fechar o chat.

**Why:** Usuário que retomava o chat com pedido já em `protocol_assigned` não via o botão de docs porque o evento `mostrar_link_docs` só disparava no fluxo `__PAGUEI__`, nunca numa sessão retomada.
