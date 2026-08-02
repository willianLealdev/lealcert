---
name: Loyalty System
description: Architecture and rules for the contador fidelidade/loyalty system
---

# Loyalty System

## How it works
- Each completed (emitted) certificate increments 1 slot on the contador's active cartela
- When a cartela reaches 10 slots → it auto-completes and a new active cartela is created
- Each completed cartela = 1 "cortesia" (free certificate)
- Cortesias accumulate, never expire

## Key tables
- `loyalty_cartelas` — one row per cartela, status: active | completed | used
- `loyalty_slot_events` — one row per order (UNIQUE on order_id for idempotency)

## Where slot increments are triggered
All three call `incrementLoyaltySlot(userId, orderId)`:
1. `artifacts/api-server/src/routes/gestaoar.ts` — manual GAR sync endpoint wasEmitido block
2. `artifacts/api-server/src/lib/scheduler.ts` — automatic GAR status sync Phase 2 wasEmitido block
3. `artifacts/api-server/src/routes/safeweb.ts` — Safeweb status webhook newStatus === "emitido"

## Key rule: idempotency
`loyalty_slot_events.order_id` has a UNIQUE constraint — safe to call incrementLoyaltySlot multiple times for the same order, it will silently skip duplicates.

## Cortesia checkout flow
1. Frontend: `GET /api/loyalty/cortesia-available` → shows option only if count > 0
2. User selects "Certificado Cortesia" → `POST /api/loyalty/checkout-cortesia`
3. Backend double-checks: userType === "contador" AND getAvailableCortesias > 0
4. Creates order with `status: "paid"`, `paymentMethod: "cortesia"`, `total: "0"`
5. Calls `useCorteisa(userId, orderId)` → marks cartela as "used"
6. Dispatches auto-buy on active provider (GAR or Safeweb)

## Admin controls
- `PATCH /api/admin/loyalty/cartelas/:id/slots` — manual slot adjustment (click numbered boxes in UI)
- Admin sidebar item "Fidelidade" → `/admin/fidelidade`
- Two tabs: "Pontuando" (all counters with progress) | "Cortesias usadas" (history)

## Frontend pages
- `/fidelidade` — contador's own page (requires userType === "contador")
- `/admin/fidelidade` — admin page (requires admin role)

**Why:** Business requirement — reward frequent counters with free certificates to increase retention and volume.
