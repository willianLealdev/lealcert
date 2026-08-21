---
name: Safeweb webhook routing
description: How the generic and UrlSolicitacao Safeweb event URLs reach certificate completion.
---

Safeweb callbacks must validate a configured high-entropy callback secret before interpreting the event and changing a certificate order. This secret is exclusive to Safeweb and must never reuse a payment provider's signing credential. The UrlSolicitacao callback receives its actual event type inside the provider payload.

**Why:** A public callback must never let an arbitrary request complete a certificate or create commercial credit. Sharing a payment credential in another provider's callback URL would broaden its exposure.

**How to apply:** Keep both provider URLs behind the same authentication rule; only construct automated callback URLs when the callback secret is configured.