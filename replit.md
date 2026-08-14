# LealCert — Plataforma de Certificados Digitais

Sistema completo para venda e gestão de certificados digitais (e-CPF, e-CNPJ, A1 e A3), com autenticação por CPF/CNPJ, painel admin, fluxo de pedidos com agendamento e integração MercadoPago.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, proxied at `/api`)
- `pnpm --filter @workspace/lealcert run dev` — run the frontend (Vite, proxied at `/`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string, `SESSION_SECRET` — express-session secret

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + wouter, shadcn/ui, Tailwind v4, TanStack Query, Recharts
- API: Express 5, express-session, bcryptjs
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/db/src/schema/index.ts` — DB schema (source of truth)
- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for API contract)
- `lib/api-client-react/src/generated/api.ts` — generated hooks + Zod schemas (do not edit)
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/lealcert/src/pages/` — React pages
- `artifacts/lealcert/src/components/layout.tsx` — sidebar navigation
- `artifacts/lealcert/src/lib/auth.tsx` — auth context + useAuth hook
- `artifacts/lealcert/public/logo.png` — brand logo

## Architecture decisions

- Session-based auth (express-session + connect-pg-simple) — simpler than JWT for this use case
- Contract-first API (OpenAPI → Orval) — frontend always uses generated hooks, never raw fetch
- CPF/CNPJ used as login identifier instead of email — matches Brazilian certificate market norms
- Admin role gates entire `/admin/*` pages; contador sees only their own orders/tickets
- MercadoPago credentials stored in DB `settings` table so admin can update without redeploy

## Product

- **Login**: CPF ou CNPJ + senha, redireciona para dashboard após autenticação
- **Dashboard** (admin): stats cards + gráfico de pedidos por dia (Recharts) + pedidos recentes
- **Pedidos**: listagem, criação com CEP auto-preenchimento (ViaCEP) + agendamento + garantia estendida, detalhe com status + pagamento MP
- **Suporte**: abertura de tickets, chat de mensagens, fechamento de chamado
- **Admin**: gestão de usuários, catálogo de certificados, horários disponíveis, configurações MP

## User preferences

- **Git push:** O agente NUNCA executa `git push`. Apenas commita. O usuário faz `git push github main` no shell do Replit quando quiser.

- All UI text in Brazilian Portuguese
- Brand: deep navy sidebar (#0f172a), cobalt blue primary (#2563eb), gold accent (#f59e0b)
- Logo at `artifacts/lealcert/public/logo.png`

## Gotchas

- Password hashes in DB must be generated via Node (bcryptjs) — do NOT embed raw bcrypt hash strings in shell commands; `$` signs get eaten
- Always run `pnpm --filter @workspace/api-spec run codegen` after changing `openapi.yaml` before editing frontend pages
- The generated hook name for listing tickets is `useListTickets` (returns `Ticket[]`), not `useListSupportTickets`
- Session secret must be set in env (`SESSION_SECRET`); cookie is `httpOnly`, `sameSite: lax`

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- Seeded accounts: admin CPF `00000000000` / `admin123` · contador CPF `12345678900` / `contador123`
