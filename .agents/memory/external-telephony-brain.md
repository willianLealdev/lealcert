---
name: External telephony brain
description: Reliability and authentication rules for using Hermes or another external AI during live calls.
---

An external telephony brain must be explicitly enabled on an active API key with the telephony brain capability and an HTTPS webhook. Incoming external-API access and outgoing Hermes webhook authentication are separate. Store the Hermes Webhook Key plus an encrypted Webhook Secret on the integration record; sign every outbound turn as HMAC-SHA256(secret, timestamp + "." + rawBody).

The synchronous Hermes contract uses `fala` for speech plus `shouldEnd`, `shouldContinue`, `command`, and `statusSuggested`. Keep accepting legacy `text` responses. Send the current commercial stage, last customer utterance, lead data, business context, full conversation, and system prompt.

Hermes is the primary brain for every live-call turn, including the opening generated before dialing. The campaign's DeepSeek/Claude/GPT setting is fallback only; TTS and voice settings still convert Hermes' speech to audio.

Never send the legacy LealCert system prompt to Hermes. Hermes owns its sales reasoning and receives only conversation, lead, stage, and business context; the legacy prompt is reserved for internal fallback.

**Why:** Live calls cannot stop when an external AI is slow or unavailable. Hermes requires its own HMAC credentials; reusing the external API token hash produces invalid authentication and conflates opposite trust directions.

**How to apply:** Pass external call context during opening pre-generation and on-demand opening as well as later customer turns. Send `User-Agent: LealCert/1.0`, the configured webhook key, Unix timestamp, and raw hex HMAC. Never expose the stored secret in API responses. Keep the timeout short and fall back internally on any failure.