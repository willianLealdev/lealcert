---
name: External telephony brain
description: Reliability and authentication rules for using Hermes or another external AI during live calls.
---

An external telephony brain must be explicitly enabled on an active API key with the telephony brain capability and an HTTPS webhook. Every turn request is signed with HMAC-SHA256 using the API-token hash as the signing key. The receiver can derive the same signing key by hashing its full API token, so LealCert does not need to retain another recoverable secret.

The synchronous Hermes contract uses `fala` for speech plus `shouldEnd`, `shouldContinue`, `command`, and `statusSuggested`. Keep accepting legacy `text` responses. Send the current commercial stage, last customer utterance, lead data, business context, full conversation, and system prompt.

Hermes is the primary brain for every live-call turn, including the opening generated before dialing. The campaign's DeepSeek/Claude/GPT setting is fallback only; TTS and voice settings still convert Hermes' speech to audio.

Never send the legacy LealCert system prompt to Hermes. Hermes owns its sales reasoning and receives only conversation, lead, stage, and business context; the legacy prompt is reserved for internal fallback.

**Why:** Live calls cannot stop when an external AI is slow or unavailable, and the outbound webhook needs verifiable authentication without storing a second plaintext credential.

**How to apply:** Pass external call context during opening pre-generation and on-demand opening as well as later customer turns. Do not use Hermes' asynchronous native webhook for live calls. Use a dedicated synchronous HTTPS endpoint, keep the timeout short, validate response fields strictly, and fall back to the configured internal AI on timeout, HTTP failure, invalid payload, revoked/expired key, or missing authorization.