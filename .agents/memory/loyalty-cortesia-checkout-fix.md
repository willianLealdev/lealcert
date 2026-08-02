---
name: Loyalty cortesia no checkout público
description: A cortesia no checkout público deve usar o userId da SESSÃO (contador logado), não o userId do titular do certificado encontrado por CPF.
---

## Regra
Em `/api/public/checkout/submit` com `paymentMethod === "cortesia"`, usar `req.session.userId` para validar e debitar a cortesia, **não** o `userId` derivado do CPF do formulário.

**Why:** O contador emite certificados para clientes — o CPF do formulário é do cliente, não do contador. O userId encontrado por CPF lookup seria o do cliente (que tem zero cartelas), causando "Nenhuma cortesia disponível" mesmo quando o contador tem 4.

**How to apply:** Sempre que o pagamento for cortesia no checkout público, extrair `const contadorUserId = req.session?.userId` e usar esse ID nas funções de loyalty. Se não houver sessão, retornar 401.
