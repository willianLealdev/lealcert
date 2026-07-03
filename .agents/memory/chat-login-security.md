---
name: Chat login + inline scheduling security
description: Security patterns for chat-based login and inline slot booking — field names, ownership checks, and password redaction.
---

## Rules

**Password field name**: `usersTable.passwordHash` — NOT `password`. Using `password` gives TS2339.

**ACAO:LOGIN_CHAT flow**:
1. AI emits `ACAO:LOGIN_CHAT:{"cpfCnpj":"...","senha":"..."}` in fullResponse
2. Backend parses JSON, calls `bcrypt.compare(senha, user.passwordHash)`
3. On success: `req.session.userId = user.id` + `req.session.save()`
4. Emits SSE `{ action: "login_ok", nome: user.name }` → frontend sets `chatLoggedIn` state
5. Injects `[LOGIN_OK:{"nome":"...","userId":N}]` into chatMessages for ownership checks later

**Password redaction (critical)**:
Before `db.insert(chatMessages, role:"assistant", content: fullResponse)` at end of route, always redact:
```ts
const redactedResponse = fullResponse.replace(/("senha"\s*:\s*)"[^"]*"/g, '$1"[OMITIDA]"');
```

**Ownership check for scheduling** (`__AGENDAR__` bypass + `ACAO:AGENDAR:`):
Three ways to authorize — any one is sufficient:
1. `req.session.userId === order.userId`
2. `verifiedCpfCnpj` matches the order owner's cpfCnpj (from [USUARIO_VERIFICADO] in history)
3. `[LOGIN_OK:{"userId":N}]` in chatHistory and N === order.userId

**Injection prevention**:
User messages are sanitized before DB insert:
```ts
message.replace(/\bACAO:[A-Z_]+:\s*\{[^{}]*\}/gi, "[CONTEÚDO INVÁLIDO REMOVIDO]")
```
This blocks prompt injection where user pastes `ACAO:LOGIN_CHAT:{...}` directly in chat.

**Why:**
- Without ownership checks anyone knowing an orderId can hijack a slot reservation.
- Without password redaction, plaintext passwords end up in the assistant chatMessages row in the DB.
- Without input sanitization, users can craft ACAO: commands that the AI might echo back verbatim, triggering the handler.
