---
name: Session cookie in production
description: browser credentials and the HTTPS proxy header are both required for sessions
---

## Rule
`lib/api-client-react/src/custom-fetch.ts` fetch call must include `credentials: "include"`, and the Nginx proxy must send `X-Forwarded-Proto: https` to the API in production.

**Why:** Browsers do not send cookies on cross-origin or same-origin fetch requests unless `credentials: "include"` is explicitly set. Separately, Express refuses to issue a `Secure` cookie when its proxy reports HTTP. Either failure produces the same symptom: login returns 200, then `/api/auth/me` returns 401.

**How to apply:** Any time the API client fetch is regenerated or rewritten, ensure the final `fetch(input, { ...init, method, headers, credentials: "include" })` call retains the credentials flag. When changing the production Nginx config, preserve the HTTPS forwarded-protocol header on every API location, including the auth-specific location.
