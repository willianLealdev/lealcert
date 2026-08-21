---
name: Operator commercial identity
description: Rules for preserving accountant ownership and operator audit attribution during purchases.
---

An operator is never the commercial account owner. Purchases initiated by an operator must use the active linked accountant for commercial eligibility and pricing, while preserving the operator separately as the attendant who performed the action.

**Why:** The accountant owns the commercial price and must retain the order history; independently retaining the operator provides accurate service attribution without letting a browser select the commercial identity.

**How to apply:** Any authenticated purchase path must resolve the server-side relationship from the operator account, reject inactive or orphaned links, use the accountant as the order owner, and record the operator as the attendant. Keep the same owner-or-attendant access guard on related order actions.