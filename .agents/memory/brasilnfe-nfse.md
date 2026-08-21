---
name: BrasilNFe NFS-e integration
description: External API contract and asynchronous processing rules for BrasilNFe NFS-e.
---

BrasilNFe API 2.0 emits NFS-e through the fiscal service endpoint with a `TipoAmbiente` and `nFSInfo` document array. An accepted lot may be processed asynchronously, so it must remain in an in-progress state until its lot status reports the authorized NFS-e number.

**Why:** The legacy-shaped endpoint and payload produced empty provider responses, which then surfaced as the misleading `Unexpected end of JSON input` error. Marking every HTTP response as emitted could also falsely confirm an asynchronous note before the prefeitura authorized it.

**How to apply:** Read provider bodies as text before parsing JSON, preserve its HTTP status and useful error body in the failure message, and only mark a note emitted after a successful lot response contains `NumeroNFSe`. Store the lot response and use its `CodLote` to query pending notes through the BrasilNFe status endpoint.