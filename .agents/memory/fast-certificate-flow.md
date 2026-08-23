---
name: Certificado Fast GAR — fluxo de emissão online
description: Como o fast certificate funciona no sistema: API, backend, frontend, diferenças do fluxo normal.
---

## Regra geral

Para certificados com `issuanceType = "Fast"` vinculados ao provedor GAR:
- **NÃO** exibe card de agendamento (videoconferência)
- **SIM** exibe card "Emissão Online" com botão "Emitir Certificado" (abre em nova aba)
- O link de emissão é o `garHopeUploadUrl` (mesmo campo do portal Hope)
- O fluxo pós-pagamento é igual: `garAutoComprar` → `garEmitirProtocolo` → Hope URL gerada

**Why:** Fast = A1 arquivo digital; cliente instala o certificado via portal online, não faz videoconferência.

## O que foi implementado

### Backend (`orders.ts`)
- `orderRow()` recebe 5º parâmetro `certIssuanceType?: string | null`
- Campo `certIssuanceType` incluído na resposta do GET /orders/:id e GET /orders (list)
- Call sites atualizados: list endpoint (join já existe), single order (join já existe), create order (`cert.issuanceType`)

### Frontend (`detail.tsx`)
- `certIssuanceType` adicionado ao type cast de `orderExt`
- `isGarFast = hasGar && certIssuanceType === "Fast"`
- `canScheduleGar` tem `&& !isGarFast` — Fast não exibe card de agendamento
- Card "Emissão Online — Certificado Fast" exibido quando `isGarFast && statusOk`
  - Alerta amarelo com requisitos (certificado plugado + dentro da validade)
  - Botão verde "Emitir Certificado" → abre `garHopeUploadUrl` em nova aba
  - Se `garHopeUploadUrl` ainda não existe → spinner azul aguardando pagamento

### Frontend (`comprar.tsx`)
- `Certificate.issuanceType?: string | null` adicionado à interface
- Estado `fastAlertOpen` para controle do modal de alerta
- Ambos os botões "Validar e Continuar" no step `bio` interceptam: se `cert.issuanceType === "Fast"` abre o Dialog de alerta antes de prosseguir
- Dialog de alerta explica os 2 requisitos e tem botão "Entendi, prosseguir" que chama `handleBioSubmit()`

## Notas
- `issuanceType = "Fast"` existe para Safeweb também (handled via `swAdicionarEmissaoOnline` em `sw-auto.ts`) — isso é independente
- Safeweb Fast NÃO usa este card — `isGarFast` checa `hasGar` primeiro
- O alerta de `canScheduleGar` não se aplica a Fast GAR; campo permanece intacto para outros tipos
