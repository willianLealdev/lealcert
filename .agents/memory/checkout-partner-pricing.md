---
name: Preço de parceiro no checkout
description: Regra comercial para aplicar o preço de contador na compra de certificados.
---

Use o perfil comercial (`userType`) da conta autenticada para definir o preço do certificado. Um contador pode emitir para o CPF/CNPJ de outra pessoa sem perder o preço de parceiro.

**Why:** O titular do certificado pode ser um cliente final, enquanto o comprador autenticado é o contador. Calcular pelo titular troca silenciosamente o preço de parceiro pelo preço de site.

**How to apply:** Exiba o preço de parceiro após a sessão ser reconhecida e sempre recalcule o total no backend a partir da sessão; valores enviados pelo navegador nunca devem decidir o preço.