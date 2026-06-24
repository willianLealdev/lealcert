---
name: Global router.use without path is a footgun
description: router.use(middleware) without a path in a router mounted without prefix intercepts ALL requests, not just that router's routes.
---

## Rule

Never use `router.use(middleware)` without a path prefix in a router that is itself mounted without a path prefix. Always scope it: `router.use("/some-path", middleware)`.

**Why:** In Express, `router.use(fn)` without a path matches every request that reaches the router. If the router is mounted with `app.use(router)` or `mainRouter.use(subRouter)` (no path), then 100% of all requests pass through `fn` — including requests meant for completely different routes.

This caused a production bug: `marketing.ts` had `router.use(requireAdmin)` at line 138 to guard admin-only routes below it. But the marketing router was mounted without a path, so `requireAdmin` intercepted ALL requests including `/agente/documentos/:protocolo`, returning 403 for agente users.

**How to apply:**
- When adding auth middleware partway through a router file, scope it: `router.use("/marketing", requireAdmin)`
- Or apply `requireAdmin` individually to each route that needs it
- Run a grep for `router.use(require` (no path) when debugging mysterious 403s
