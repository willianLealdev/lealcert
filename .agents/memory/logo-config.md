---
name: Logo configuration
description: Configuração definitiva dos logos em cada parte do sistema — não alterar sem pedido explícito do usuário.
---

## Regra

**Nunca alterar nenhum logo sem o usuário pedir explicitamente.** Mesmo que pareça desalinhado visualmente, manter como está.

## Mapa de logos por localização

| Local | Arquivo | Tamanho | Notas |
|---|---|---|---|
| Página de Login (painel esquerdo desktop) | `/logo-novo-transparente.png` | `h-56` | sem drop-shadow, sem filtro |
| Página de Criar Conta (register) | `/logo-novo-transparente.png` | `h-56` | sem drop-shadow, sem filtro |
| Sidebar interno (layout.tsx — expandido) | `/logo-oficial-cropped.png` | `h-14` | área da marca com `bg-white` |
| Sidebar interno (layout.tsx — colapsado mobile) | `/logo.png` | `h-8 w-8` | com brightness filter |
| Sidebar interno (layout.tsx — header mobile) | `/logo.png` | `h-9` | com brightness filter |
| Forgot password | `/logo.png` | `h-24` | sem filtro |
| Change password | `/logo.png` | `h-24` | sem filtro |
| Verify email | `/logo.png` | `h-24` | sem filtro |
| Login page (mobile, sem painel esquerdo) | `/logo.png` | `h-24` | sem filtro |

**Why:** O usuário passou por várias iterações de ajuste de logo e aprovou explicitamente este estado. Qualquer mudança futura deve vir de pedido direto.
