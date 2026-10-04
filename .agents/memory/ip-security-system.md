---
name: Regra de acesso por país do IP
description: Brasil confirmado deve ter prioridade sobre bloqueios de IP, incluindo IPv6.
---

Primeiro verificar se o IP que tenta acessar é do Brasil; se confirmado, liberar imediatamente. A regra vale para IPv4 e IPv6, tem prioridade sobre bloqueios anteriores e impede novos bloqueios por falhas de login para IPs brasileiros.

**Why:** O usuário determinou: “o ip que esta tentando acessar e do Brasil.. se sim.. libera imediatamente”, após relatar bloqueios indevidos de IPv6 brasileiros. A regra anterior de espera de quatro horas para Brasil foi substituída.

**How to apply:** Não inferir país apenas pelo formato ou prefixo do IP. Confirmar o país por geolocalização antes de aplicar bloqueios. País desconhecido não significa estrangeiro. Preservar autenticação por senha, verificação de e-mail e proteção por CPF; liberar o IP não autentica o usuário.
