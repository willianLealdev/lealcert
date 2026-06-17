---
name: OpenAPI Order schema completeness
description: The Order schema in openapi.yaml must include every field that orderRow() returns; missing fields cause TypeScript types to lack those properties.
---

## Rule
Any field added to `orderRow()` in `orders.ts` must also appear in the `Order` schema in `lib/api-spec/openapi.yaml`. After adding to both, run `pnpm --filter @workspace/api-spec run codegen`.

**Why:** Before the Safeweb integration, GAR fields (garPedido, garProtocolo, garStatus, garSyncedAt, garAgendamento*) were absent from the Order OpenAPI schema, forcing the frontend to use `as unknown as Record<string, unknown>` casts to access them.

**How to apply:** Order schema is at `lib/api-spec/openapi.yaml` around line 2017. After adding fields, codegen regenerates `lib/api-client-react/src/generated/api.ts` with correct types.
