# API externa de telefonia

Base: `/api/external/v1`

Autenticação:

```http
Authorization: Bearer lc_live_...
```

## Permissões da chave

- `analyze`: consulta ligações e todos os dados comerciais associados.
- `brain`: autoriza o LealCert a enviar cada turno ao webhook configurado.
- `command`: inicia chamadas, controla campanhas e executa ações comerciais.

O módulo `discagem` também precisa estar habilitado. O nível HTTP geral continua sendo aplicado: uma chave `read` não executa comandos `POST` ou `PATCH`.

## Consulta

- `GET /telephony/calls?page=1&limit=50&status=answered&campaignId=1`
- `GET /telephony/calls/:id`

As respostas incluem transcrição, status, resultado final, prompt utilizado, fonte de IA, interesse, motivo do encerramento, WhatsApp, resumo, retorno e tarefa humana.

## Comandos

- `POST /telephony/calls/start`
- `POST /telephony/campaigns/:id/pause`
- `POST /telephony/campaigns/:id/resume`
- `PATCH /telephony/calls/:id/commercial`
- `POST /telephony/calls/:id/whatsapp`
- `POST /telephony/calls/:id/summarize`

Exemplo de atualização comercial:

```json
{
  "interestStatus": "interested",
  "endReason": "Pediu retorno após falar com o sócio",
  "callbackAt": "2026-09-21T14:00:00-03:00",
  "humanTask": "Vendedor deve enviar proposta para 20 certificados"
}
```

## Webhook do cérebro externo

Para cada turno do cliente, o LealCert envia:

```json
{
  "event": "telephony.turn.requested",
  "timestamp": "1758230000000",
  "context": {
    "callId": 123,
    "campaignId": 10
  },
  "conversation": [
    { "role": "user", "text": "Pode me explicar?", "ts": "..." }
  ],
  "systemPrompt": "..."
}
```

Cabeçalhos:

- `X-LealCert-Key`: prefixo público da chave.
- `X-LealCert-Timestamp`: mesmo timestamp do corpo.
- `X-LealCert-Signature`: `sha256=<hmac>`.

Verificação da assinatura:

1. Calcule SHA-256 do token completo da chave. O resultado hexadecimal é a chave do HMAC.
2. Calcule HMAC-SHA256 sobre `timestamp + "." + corpo bruto`.
3. Compare em tempo constante com o valor de `X-LealCert-Signature`.
4. Rejeite timestamps antigos para impedir replay.

O webhook deve responder em até 4,5 segundos:

```json
{ "text": "A próxima fala curta do agente." }
```

Comandos já reconhecidos dentro de `text`:

- `[ENCERRAR]`
- `[OPTOUT]`
- `[TRANSFERIR_HUMANO]`
- `[SOLICITAR_CALLBACK_HUMANO]`
- `[REGISTRAR_EMAIL:email@exemplo.com]`

Se houver timeout, erro HTTP ou resposta inválida, a ligação continua com a IA interna configurada no LealCert.