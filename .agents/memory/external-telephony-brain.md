---
name: External telephony brain
description: Reliability and authentication rules for using Hermes or another external AI during live calls.
---

An external telephony brain must be explicitly enabled on an active API key with the telephony brain capability and an HTTPS webhook. Every turn request is signed with HMAC-SHA256 using the API-token hash as the signing key. The receiver can derive the same signing key by hashing its full API token, so LealCert does not need to retain another recoverable secret.

**Why:** Live calls cannot stop when an external AI is slow or unavailable, and the outbound webhook needs verifiable authentication without storing a second plaintext credential.

**How to apply:** Keep the webhook timeout short enough for a natural voice conversation, validate response text strictly, and fall back to the configured internal AI on timeout, HTTP failure, invalid payload, revoked/expired key, or missing authorization.