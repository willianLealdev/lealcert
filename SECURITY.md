# Segurança — LealCert

Documento com todas as proteções implementadas na plataforma.

---

## ✅ Injeção

| Ataque | Status | Como foi mitigado |
|--------|--------|-------------------|
| SQL Injection | ✅ Protegido | Drizzle ORM usa queries parametrizadas em 100% dos acessos ao banco. Nenhuma concatenação de string em SQL. |
| Command Injection | ✅ Protegido | Nenhum uso de `exec`, `spawn` ou `child_process` na aplicação. |
| NoSQL Injection | ✅ N/A | Banco exclusivamente PostgreSQL relacional. |

---

## ✅ Autenticação e Sessão

| Ataque | Status | Como foi mitigado |
|--------|--------|-------------------|
| Brute force de login | ✅ Protegido | Rate limiter estrito: 10 tentativas / 15 min por IP nos endpoints `/auth/login`, `/auth/register`, `/auth/forgot-password` e `/auth/resend-verification`. |
| Credential stuffing | ✅ Protegido | Coberto pelo mesmo rate limiter acima. |
| Session hijacking | ✅ Protegido | Cookie com `httpOnly: true`, `secure: true` (só HTTPS em produção), `sameSite: lax`. Nome do cookie alterado de `connect.sid` para `sess` (evita fingerprinting). |
| Fixação de sessão | ✅ Protegido | `req.session.regenerate()` executado após todo login bem-sucedido. |
| Senhas em texto puro | ✅ Protegido | Todas as senhas armazenadas com hash `bcryptjs` (custo 10). Nunca em texto puro. |
| SESSION_SECRET fraco | ✅ Monitorado | Servidor recusa iniciar em produção se a variável estiver ausente ou igual ao valor padrão de desenvolvimento. Aviso de log se tiver menos de 32 caracteres. |

---

## ✅ Cross-Site

| Ataque | Status | Como foi mitigado |
|--------|--------|-------------------|
| XSS (Cross-Site Scripting) | ✅ Protegido | React escapa output por padrão. Único ponto de `dangerouslySetInnerHTML` (marketing/respostas de email) usa `DOMPurify.sanitize()` antes de renderizar. |
| CSRF | ✅ Protegido | Autenticação por sessão com `sameSite: lax`. Endpoint `/auth/csrf-token` disponível. CORS bloqueia origens não autorizadas. |
| CORS mal configurado | ✅ Protegido | Lista de origens permitidas explícita via `ALLOWED_ORIGINS`. Em produção, qualquer origem não listada recebe erro. Nunca usa `origin: "*"` com `credentials: true`. |

---

## ✅ Outros Ataques Web

| Ataque | Status | Como foi mitigado |
|--------|--------|-------------------|
| IDOR | ✅ Protegido | Todo acesso a pedido verifica se `order.userId === session.userId`. Admin tem bypass explícito e controlado. Tickets idem. |
| Mass assignment | ✅ Protegido | Rotas desestruturam campos específicos do `req.body`. Nunca usa `...req.body` ou spread direto em updates do banco. |
| Path traversal | ✅ Protegido | `isSafeFile()` valida que o caminho resolvido está dentro do diretório esperado. `path.basename()` aplicado em todo parâmetro de filename antes do acesso. |
| Upload malicioso | ✅ Protegido | Camada 1: filtro MIME type (PDF/JPG/PNG). Camada 2: verificação de magic bytes (conteúdo binário real). Tamanho máximo: 5MB. Nomes de arquivo aleatorizados. Arquivos inválidos excluídos imediatamente. |
| SSRF | ✅ Protegido | URLs externas (MercadoPago, GAR, Safeweb, Evolution API) vêm da tabela `settings` controlada pelo admin, nunca de input direto do usuário. |
| Rate limit / DoS | ✅ Protegido | Geral: 200 req/15min por IP. Auth: 10/15min. Chat/IA: 30/15min. Body parsing limitado a 1MB. |

---

## ✅ Infraestrutura

| Ataque | Status | Como foi mitigado |
|--------|--------|-------------------|
| HTTPS / downgrade | ✅ Protegido | HTTPS obrigatório via EasyPanel/Traefik. Cookie `secure: true` recusa envio em HTTP. |
| Headers de segurança | ✅ Protegido | `helmet` configurado: `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `X-XSS-Protection`, etc. |
| PostgreSQL exposto | ✅ Protegido | Banco na rede Docker interna (`default`). Não acessível publicamente. Apenas o container `api` se conecta. |
| Container como root | ✅ Protegido | Container `api` roda com usuário dedicado `appuser` (UID 1001, sem shell). Container `web` usa usuário `nginx` padrão do Alpine. |
| Robots / indexação | ✅ Protegido | `robots.txt` bloqueia `/dashboard`, `/admin`, `/pedidos`, `/suporte`, `/perfil` de serem indexados pelo Google. |

---

## ⚠️ Recomendações Pendentes (não críticas)

| Item | Risco | Recomendação |
|------|-------|--------------|
| Secrets no compose | Médio | `easypanel-compose.yml` tem senha do banco e SESSION_SECRET em texto. Usar Secrets do EasyPanel para variáveis sensíveis. |
| SESSION_SECRET atual | Médio | Trocar para uma string aleatória de 64+ caracteres. Gere com: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| Dependências npm | Baixo | Rodar `pnpm audit` periodicamente para checar CVEs em pacotes. |
| 2FA para admin | Baixo | Considerar autenticação em dois fatores para o painel admin no futuro. |

---

## Gerar um SESSION_SECRET seguro

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Cole o resultado no EasyPanel → seu app → Environment Variables → `SESSION_SECRET`.
