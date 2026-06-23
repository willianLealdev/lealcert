---
name: Safeweb agenda paths and host
description: Agenda endpoints use a DIFFERENT host from the main API, and POST agendar uses a different auth header.
---

# Safeweb Agenda — Official Paths and Host

Source: https://h-acsafeweb.safewebpss.com.br/hotsite/documentacao-safeweb/home/#/docs/integracao-agenda/

## Critical: Different base host

| Environment | Main API host | Agenda host |
|---|---|---|
| Homologação | `h-acsafeweb.safewebpss.com.br` | `h-pss.safewebpss.com.br` |
| Produção | `acsafeweb.safewebpss.com.br` | `pss.safewebpss.com.br` |

`getAgendaBaseUrl(mainUrl)` in `lib/safeweb.ts` derives the agenda host: replaces `acsafeweb.safewebpss.com.br` → `pss.safewebpss.com.br`.

All agenda HTTP helpers (`swAgendaGetHttp`, `swAgendaPostHttp`, `swAgendaDeleteHttp`) call this function automatically. Pass `settings.agendaUrl` to override for custom deployments.

## All agenda endpoints: `/Service/MicroService/Agenda/Agendamentos/api/Integracao/`

| Operation | Method | Path |
|-----------|--------|------|
| Listar horários | GET | `/horarios/{localAtendimentoId}/{data}` (data = YYYY-MM-DD, optional) |
| Agendar / Reagendar | POST | `/agendamento` |
| Cancelar | DELETE | `/agendamento/{protocolo}/{catalogoProdutoId}` |
| Configuração | GET | `/configuracao/{localAtendimentoId}` |
| Informações | GET | `/informacoes/{protocolo}` |

## Auth header differences (per official docs)
- GET horarios / GET configuracao / DELETE cancelar: `Authorization: [TOKEN]` — no prefix
- POST agendar: `Authorization: bearer [TOKEN]` — lowercase `bearer` prefix

## Field types
- `localAtendimentoId` = Int (from `idLocalAtendimento` in GetListByCnpjAR response)
- `protocolo` = String = `order.safewebSolicitacaoId`
- `catalogoProdutoId` = **Int** (docs: Int), from `certificate.safewebIdProduto` — cast to number, not string
- `data` for agendar = full ISO datetime `"YYYY-MM-DDTHH:mm:ss"` (not just date)

## Agendar request body (all numbers, not strings)
```json
{ "localAtendimentoId": 1, "protocolo": "8000136590", "data": "2024-07-23T09:00:00", "catalogoProdutoId": 42 }
```

## Listar horários response
```json
{ "localAtendimentoId": 1, "data": "2024-07-23", "atendimentos": [{ "horarioInicio": "08:00", "horarioFim": "09:00", "bloqueado": false, "agendado": false }] }
```

**Why:** All agenda calls were silently going to the wrong host (`acsafeweb` instead of `pss`), returning no data. The agenda service is a completely separate microservice on a different subdomain.

**How to apply:** Any code calling Safeweb agenda functions must use `swAgenda*` functions — never `swGet`/`swPost`/`swDelete` for agenda paths.
