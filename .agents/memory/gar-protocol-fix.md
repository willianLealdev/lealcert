---
name: GAR protocol date normalization + sync scheduler
description: Fix for ErrorCode 888 (data de nascimento inválida) e job de sincronização de protocolos GAR.
---

## Problema
GAR `EmitirProtocolo` retornava ErrorCode 888 "Data de Nascimento do Titular inválida" porque o campo `dataNascimento` chegava em DD/MM/YYYY (formato brasileiro salvo no banco) mas a API exige YYYY-MM-DD.

## Fix em `gar-auto.ts`
- `normalizeDateForGar(date: string): string` — converte DD/MM/YYYY → YYYY-MM-DD; passa datas já em ISO sem alterar.
- `emitirProtocoloEHope(orderId, order, settings)` — exportada como função standalone para reuso.
- Lógica de retry: se pedido já tem `garPedido` mas não tem `garProtocolo`, pula o Comprar e tenta emitir protocolo direto.

## Scheduler `syncGarProtocols()` em `scheduler.ts`
- Roda a cada 5 minutos; primeira execução 5s após o boot.
- Para cada pedido com `garPedido` mas sem `garProtocolo`:
  1. Chama `garConsultarStatus` — se já existe protocolo gerado manualmente no portal GAR, sincroniza de volta + gera Hope URL.
  2. Se não, chama `emitirProtocoloEHope` com data normalizada.
- Registrado em `startScheduler()` com log "GAR protocol sync started (5min interval)".

**Why:** Pedidos criados com datas em formato BR falhavam silenciosamente na emissão; protocolo precisava ser gerado manualmente no portal GAR e não voltava para o sistema automaticamente.
