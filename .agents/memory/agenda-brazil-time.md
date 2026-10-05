---
name: Visibilidade da agenda no horário de Brasília
description: Atendimento de hoje permanece visível até seu horário exato, independentemente do fuso da VPS.
---

Um atendimento marcado para 15:00 no Brasil deve aparecer na agenda até chegar às 15:00, e desaparecer nesse horário, não no começo do dia.

**Why:** O usuário relatou que atendimento de hoje não aparecia na agenda da VPS. Horários sem fuso dos provedores eram interpretados no fuso do servidor.

**How to apply:** Interpretar horários civis de GAR/Safeweb como Brasília. Ao ler históricos, usar o horário registrado pelo provedor para recuperar o instante correto sem editar dados por suposição. A tela deve atualizar a visibilidade ao atingir o início do atendimento, mesmo permanecendo aberta.
