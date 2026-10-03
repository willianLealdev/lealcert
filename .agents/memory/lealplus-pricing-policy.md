---
name: Política de preço do Leal Plus
description: Preço do catálogo controlado pelo backend e preservação dos valores históricos.
---

O preço do Leal Plus deve ser editável no catálogo e persistido no banco, sempre aplicado pelo backend; a tela nunca define o valor cobrado.

**Why:** O usuário determinou: “isso tem que esta no banco de dados, sempre no bankend, nunca pode ser na tela”. Valores fixos divergentes causaram cobrança e discriminação incorretas.

**How to apply:** Todos os caminhos de criação de pedidos devem consultar o preço vigente no banco. Guardar o preço cobrado no pedido, para que alterações futuras no catálogo não modifiquem históricos. Pedidos anteriores sem esse registro devem manter o total original e não ter seu preço do adicional reconstruído por suposição.