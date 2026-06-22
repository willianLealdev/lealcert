---
name: Safeweb agenda paths
description: Official Safeweb agenda API endpoint paths (NOT the inferred Shared/Schedule paths)
---

# Safeweb Agenda — Official Paths

Source: https://h-acsafeweb.safewebpss.com.br/hotsite/documentacao-safeweb/home/#/docs/integracao-agenda/

All agenda endpoints are under: `/Service/MicroService/Agenda/Agendamentos/api/Integracao/`

| Operation | Method | Path |
|-----------|--------|------|
| Listar horários | GET | `/horarios/{localAtendimentoId}/{data}` (data = YYYY-MM-DD, optional) |
| Agendar | POST | `/agendamento` |
| Cancelar agendamento | DELETE | `/agendamento/{protocolo}/{catalogoProdutoId}` |
| Configuração | GET | `/configuracao/{localAtendimentoId}` |
| Informações | GET | `/informacoes/{protocolo}` |

## Key details

- `localAtendimentoId` = numeric ID from AttendancePlace/GetListByCnpjAR response (`idLocalAtendimento` field)
- `protocolo` for agendar/cancelar = `order.safewebSolicitacaoId` (the ID returned when the solicitação is created)
- `catalogoProdutoId` = certificate's `safewebIdProduto` (from certificates table)
- `data` = YYYY-MM-DD string; if omitted defaults to today on the Safeweb side

## Agendar request body

```json
{ "localAtendimentoId": 1, "protocolo": "8000136590", "data": "2024-07-23", "catalogoProdutoId": "42" }
```

## Listar horários response

```json
{
  "localAtendimentoId": 1,
  "data": "2024-07-23",
  "atendimentos": [
    { "horarioInicio": "08:00", "horarioFim": "09:00", "bloqueado": false, "agendado": false }
  ]
}
```

**Why:** The originally inferred paths (`/Service/Microservice/Shared/Schedule/api/...`) were completely wrong. The Safeweb agenda is a separate microservice (`Agenda/Agendamentos`) with a different URL pattern. These paths were confirmed from the official Safeweb documentation.

**How to apply:** Any code calling Safeweb agenda functions must use the `swAgenda*` functions in `safeweb.ts` — do NOT hardcode paths.
