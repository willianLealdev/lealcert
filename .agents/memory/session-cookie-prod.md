---
name: Session cookie in production
description: custom-fetch must send credentials:"include" or session cookies are never sent
---

## Rule
`lib/api-client-react/src/custom-fetch.ts` fetch call must include `credentials: "include"`.

**Why:** Browsers do not send cookies on cross-origin or same-origin fetch requests unless `credentials: "include"` is explicitly set. Without it, every call to `/api/auth/me` returns 401 even when the user just logged in successfully — the login POST works, the session is created server-side, but subsequent requests never carry the cookie so the auth context always sees the user as logged out.

**How to apply:** Any time the API client fetch is regenerated or rewritten, ensure the final `fetch(input, { ...init, method, headers, credentials: "include" })` call retains the credentials flag.
