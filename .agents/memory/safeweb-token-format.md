---
name: Safeweb token format
description: Critical: Safeweb API authentication and endpoint path conventions
---

## Rule

Send the `tokenAcesso` value directly in the `Authorization` header — NO "Bearer" or "bearer" prefix.

**Wrong:** `Authorization: Bearer eyJhbGci...`
**Correct:** `Authorization: eyJhbGci...`

## Why

Safeweb's microservices read the Authorization header differently from the OAuth2 standard. Sending "Bearer {token}" causes all non-auth endpoints to return HTTP 500 "Invalid JSON primitive: ." (the period comes from the JWE dot separators being parsed). Without the prefix, the token is accepted and endpoints return correct responses.

Confirmed by exhaustive testing: only the raw token (no prefix) returns HTTP 200.

## How to apply

In `artifacts/api-server/src/lib/safeweb.ts`, all three HTTP helpers (`swGet`, `swPost`, `swDelete`) must use `"Authorization": token` (not `"Authorization": \`Bearer ${token}\``).

## Other key facts

- Auth response field: `tokenAcesso` (not `access_token`)
- Auth expiry field: `expiraEm` (Unix timestamp)
- PSBio Global path (official, from docs): `/Service/Microservice/Shared/Partner/api/psbio/consulta/biometria/global`
- PSBio Local path (official): `/Service/Microservice/Shared/Partner/api/psbio/consulta/biometria/local`
- PSBio request body: `{ "cpf": "55322901051" }` (lowercase key, only field needed)
- PSBio success response: `{ "encontrado": true }` or `{ "encontrado": false }`
- ConsultaPrevia date format: ISO `"DtNascimento": "1986-04-08"` (NOT Brazilian DD/MM/YYYY)
- Documentation: https://developers.safewebpss.com.br (Docsify SPA, fetch /_sidebar.md for structure)
