---
name: GAR Agendamento flow
description: Correct scheduling flow for Gestão AR, what each endpoint returns, and the garAgendar bug that was fixed.
---

## Correct flow

1. `LocaisAgendamento` → list of locations (HashLocal, NomeLocalAgendamento, UF, Municipio, Endereco)
2. `LocaisAgendamentoSlot` → list of **attendants/agents** (NOT time slots) — NomeSlotAgendamento is a person's name
3. `ObterDisponibilidadeAgenda` → available dates/times. Params: apiKey, DataInicial, DataFinal, HashLocal, [HashSlot optional]. Returns `{ Datas: [{ DataAgenda, sDataAgenda, Horarios: [{ HoraInicial, HoraFinal }] }] }`
4. `Agendamento` → book. Params: apiKey, HashVenda, HashLocal, DataInicial ("YYYY-MM-DD HH:mm"), DataFinal ("YYYY-MM-DD HH:mm"), IsCliente. **Returns `[]` (empty array) on success**, or array of error objects `{ ErrorCode, ErrorDescription }` on failure.

## Critical bug that was fixed

The route `/orders/:id/agendar` was calling garAgendar with wrong parameter order:
- **Wrong:** `garAgendar(apiKey, order.garPedido, order.garProtocolo, hashLocal, hashSlot)` — garProtocolo passed as hashLocal, hashLocal as DataInicial, hashSlot as DataFinal
- **Fixed:** `garAgendar(apiKey, order.garPedido, hashLocal, dataInicial, dataFinal)` — frontend sends dataInicial/dataFinal as "YYYY-MM-DD HH:mm" strings

## Calling without an order

`ObterDisponibilidadeAgenda` can be called without HashVenda — only needs apiKey, dates, HashLocal (optional HashSlot). Only the final `Agendamento` call needs the GAR sale identifier stored in `garPedido`.

**Why:** `garAutoComprar` stores `Produtos[0].Pedido` from `garComprar` in `garPedido`. This is the GAR order number (the `Id` returned by `parceiroVendas`); it is distinct from the issuance protocol and sale hashes.

## Return type

`GarAgendarResult | GarAgendarResult[]` — always check with `Array.isArray(result)` before accessing object properties. An empty array `[]` means success.

## API base URL

The Safeweb/Juntos URL `https://apiar.safeweb.com.br/Juntosapi/api/GarAPIs` works for this customer (not the generic `https://gestaoar.com.br/ComercialAPI/api/GarAPIs` shown in docs).
