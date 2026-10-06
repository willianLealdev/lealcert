---
name: Operator commercial identity
description: Rules for preserving accountant ownership and operator audit attribution during purchases.
---

An operator is never the commercial account owner. Purchases initiated by an operator must use the active linked accountant for commercial eligibility and pricing, while preserving the operator separately as the attendant who performed the action.

O operador também poderá comprar e pagar; poderá fazer todo o fluxo normal do pedido em nome do contador.

**Why:** O usuário confirmou que o operador deve executar o fluxo completo, não apenas consultar ou agendar.

**Why:** The accountant owns the commercial price and must retain the order history; independently retaining the operator provides accurate service attribution without letting a browser select the commercial identity.

**How to apply:** Any authenticated purchase path must resolve the server-side relationship from the operator account, reject inactive or orphaned links, use the accountant as the order owner, and record the operator as the attendant. Operators mirror the contador's user-facing areas and commercial benefits; only operator management stays exclusive to the contador. Lists, detail views, payment actions, loyalty, and the operator dashboard must scope to that accountant owner so the whole office shares the same order history and commercial indicators.