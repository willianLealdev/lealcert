---
name: Resposta PSBio Safeweb
description: Formatos de retorno da biometria PSBio e dados necessários para a consulta.
---

A confirmação da PSBio deve aceitar os formatos positivos retornados pela Safeweb (`encontrado`, `Encontrado`, `resultado`, `biometria`, `status` ou `statusCode`), e a consulta deve receber a data de nascimento quando ela estiver disponível.

**Why:** o fornecedor não retorna sempre uma única chave booleana. Restringir a leitura a `encontrado === true` transforma respostas válidas em falso negativo e bloqueia a emissão por videoconferência.

**How to apply:** ao criar ou alterar um fluxo que consulte PSBio, use o normalizador compartilhado da integração e encaminhe o CPF e a data de nascimento coletados pela tela.