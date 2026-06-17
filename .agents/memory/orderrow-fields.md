---
name: OrderRow fields
description: The orderRow() helper in orders.ts must explicitly enumerate all fields; omissions cause the frontend to receive null/undefined silently.
---

## Rule
`orderRow()` in `artifacts/api-server/src/routes/orders.ts` is a manual projection function. It does NOT auto-spread all DB columns. Every field a frontend page needs must be explicitly listed.

**Why:** Discovered that GAR fields (garPedido, garStatus, etc.) and Safeweb fields were missing from the projection, causing the admin order detail page to never see provider data even though the DB had it.

**How to apply:** When adding a new column to the orders table, always add it to `orderRow()` AND to the Order schema in `openapi.yaml`, then re-run codegen.
