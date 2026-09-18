---
name: API key gateway sessions
description: Security rule for reusing session-authorized internal routes behind Bearer API authentication.
---

Bearer-authenticated gateway requests may inject an authorization context only for the lifetime of the current request. They must never persist that context to the session store or emit a session cookie.

**Why:** Reusing handlers that read `req.session` can otherwise convert a valid API key into a reusable browser admin session, bypassing the intended Bearer-token boundary.

**How to apply:** Any external API gateway that delegates to session-based handlers must suppress session saving and `Set-Cookie`, then verify with a real request that the response contains no session cookie.