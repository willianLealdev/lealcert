---
name: IP Security system
description: How the IP-based login protection system works and what files implement it.
---

## Design

- 3 failed login attempts → IP blocked
- Brazil IPs: auto-unblock after 4h (stored in `ip_blocks.unblock_at`)
- Foreign IPs: blocked until admin manually unblocks
- Admin can also permanently ban any IP
- First login from a new IP → send 6-digit code to user's email → user must verify → IP added to `users.trusted_ips`

## DB tables (applied via 0001_ip_security.sql migration)
- `ip_logs` — all login/register events per IP
- `ip_blocks` — currently blocked/banned IPs
- `ip_verifications` — pending IP verification codes (15min TTL)
- `users.registration_ip` + `users.trusted_ips` (jsonb array, max 10)

## Key files
- `artifacts/api-server/src/lib/ip-security.ts` — all IP logic (check status, record attempts, handle failures, trusted IPs, auto-unblock)
- `artifacts/api-server/src/routes/auth.ts` — login integrates IP checks; also `POST /auth/verify-ip`
- `artifacts/api-server/src/routes/ip-security.ts` — admin routes for logs/blocks/ban/unblock
- `artifacts/api-server/src/lib/scheduler.ts` — calls `autoUnblockExpiredIps()` every 10min
- `artifacts/lealcert/src/pages/login.tsx` — two-step login (credentials → ip-verify) with ban/block banners
- `artifacts/lealcert/src/pages/admin/ip-security.tsx` — admin dashboard

## HTTP codes used
- 403 + `code: "ip_banned"` — permanently banned IP
- 423 + `code: "ip_blocked"` — temporarily blocked IP
- 202 + `{ requiresIpVerification: true }` — credentials OK but IP needs verification
