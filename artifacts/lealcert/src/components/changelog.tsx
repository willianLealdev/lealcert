import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles } from "lucide-react";

type UpdateType = "fix" | "novo" | "melhoria" | "segurança";

interface ChangelogEntry {
  date: string;
  version: string;
  changes: { type: UpdateType; text: string }[];
}

const CHANGELOG: ChangelogEntry[] = [
  {
    date: "20/08/2026",
    version: "1.54",
    changes: [
      { type: "novo", text: "Operadores de contador: cadastro ilimitado com CPF e e-mail, senha provisória enviada automaticamente e troca obrigatória no primeiro acesso." },
      { type: "novo", text: "Gestão de operadores: contador pode bloquear, excluir ou resetar a senha; a recuperação de senha também confirma CPF/CNPJ e e-mail cadastrado." },
      { type: "melhoria", text: "Compras feitas por operador usam sempre o preço do contador responsável e o detalhe administrativo do pedido identifica o operador atendente." },
    ],
  },
  {
    date: "20/08/2026",
    version: "1.53",
    changes: [
      { type: "fix", text: "Boleto no checkout: descrição e regra de disponibilidade alinhadas para pedidos a partir de R$ 90,00." },
    ],
  },
  {
    date: "20/08/2026",
    version: "1.52",
    changes: [
      { type: "fix", text: "Login em produção: restaurado o encaminhamento HTTPS entre o site e a API, garantindo que o cookie de sessão seja salvo após autenticar." },
    ],
  },
  {
    date: "20/08/2026",
    version: "1.51",
    changes: [
      { type: "fix", text: "Implantação EasyPanel: o Compose agora constrói a API e o site a partir do commit atual, evitando reiniciar imagens antigas e garantindo que as rotas da API sejam publicadas junto com o frontend." },
    ],
  },
  {
    date: "20/08/2026",
    version: "1.50",
    changes: [
      { type: "fix", text: "Validação de biometria PSBio: pedidos e checkout agora enviam a data de nascimento à consulta e reconhecem corretamente os formatos válidos retornados pela Safeweb." },
    ],
  },
  {
    date: "20/08/2026",
    version: "1.49",
    changes: [
      { type: "fix", text: "Preço de contador no pedido autenticado: o servidor agora consulta o tipo da conta a cada criação de pedido e mantém o valor de parceiro até o pagamento, mesmo quando o certificado é emitido para um cliente." },
    ],
  },
  {
    date: "20/08/2026",
    version: "1.48",
    changes: [
      { type: "fix", text: "Checkout de contadores: o preço de parceiro agora é mantido da seleção do catálogo até o pagamento. O servidor também recalcula o valor pelo perfil da conta autenticada, inclusive quando o contador emite para um cliente." },
    ],
  },
  {
    date: "20/08/2026",
    version: "1.47",
    changes: [
      { type: "novo", text: "Agenda de reuniões: administradores e vendedores agora criam e gerenciam videoconferências com participantes ilimitados, convites por e-mail e links para entrar ou copiar." },
      { type: "novo", text: "Reuniões: permissões aplicadas no sistema — administradores veem e excluem todas as reuniões; vendedores cuidam somente das próprias." },
      { type: "novo", text: "Configuração Jitsi adicionada ao painel administrativo para definir domínio, App ID e segredo de assinatura dos links seguros." },
    ],
  },
  {
    date: "16/08/2026",
    version: "1.46",
    changes: [
      { type: "melhoria", text: "Discagem IA: pitch completo em ordem lógica — após aceitar os 2 minutos, o agente apresenta todos os benefícios em sequência: margem → processo online → painel de controle → programa de cortesia → oferta de fechamento com urgência (cupom PARCEIRO + 24h)" },
      { type: "melhoria", text: "Discagem IA: fechamento com urgência — preço revelado só DEPOIS de todos os benefícios, como oferta de fechamento; agente tenta fechar na hora orientando o cadastro passo a passo ao vivo; se disser 'vou pensar', faz uma última tentativa e tenta capturar o e-mail antes de encerrar" },
    ],
  },
  {
    date: "16/08/2026",
    version: "1.45",
    changes: [
      { type: "fix", text: "Discagem IA: eliminados os sons 'amham/hmm' — eram fillers de áudio tocados enquanto a IA processava; frases trocadas por respostas neutras sem sons guturais" },
      { type: "fix", text: "Discagem IA: barge-in real implementado — stream WebSocket agora é bidirecional (track=both_tracks); ao detectar fala do usuário durante reprodução do agente, envia evento 'clear' ao Twilio e interrompe imediatamente; conversa agora funciona com interrupção natural" },
      { type: "fix", text: "Discagem IA: período de graça de 3s após início do stream + 1.5s após cada fala do agente — elimina eco do TTS disparando o handler de silêncio" },
      { type: "fix", text: "Discagem IA: abordagem simplificada — após confirmar o interlocutor, vai direto ao pedido de 2 minutos; se recusar, oferece e-mail; se recusar também, encerra com elegância; sem interrogatório de diagnóstico antes do 'sim'" },
      { type: "fix", text: "Discagem IA: ttsProvider default corrigido em conversation-state.ts (estava 'cartesia' hardcoded, agora 'elevenlabs')" },
    ],
  },
  {
    date: "16/08/2026",
    version: "1.44",
    changes: [
      { type: "fix", text: "Discagem IA: transcrição das ligações sumia quando o servidor reiniciava — o histórico da conversa ficava só em memória (conversationCache) e era perdido. Agora o transcript é salvo no banco a cada turno concluído (cada vez que /reply serve o áudio), então o botão 'Ver' aparece imediatamente após o primeiro turno e sobrevive a qualquer restart do servidor" },
    ],
  },
  {
    date: "16/08/2026",
    version: "1.43",
    changes: [
      { type: "fix", text: "Discagem IA: prompt dizia 'fornecedor' em todos os lugares — corrigido para 'certificadora' (abertura, diagnóstico, objeção, histórico)" },
      { type: "fix", text: "Discagem IA: '.br' saindo com pronúncia estranha no TTS — reescrito como 'ponto be erre' em todas as URLs faladas" },
      { type: "melhoria", text: "Discagem IA: lista de certificadoras simplificada para reconhecimento apenas (sem misturar estratégia de vendas no bloco de vocabulário)" },
      { type: "melhoria", text: "Discagem IA: script completo de cadastro e orientação ao parceiro contador adicionado ao prompt — benefícios (preço R$90, margem, portal, 24h, videoconferência, programa de cortesia, cupom PARCEIRO), passo a passo real do site (CRC, pedido, pagamento, vídeo, emissão) e fechamento natural. Agente orienta um passo de cada vez, adapta ao ritmo da conversa" },
    ],
  },
  {
    date: "16/08/2026",
    version: "1.42",
    changes: [
      { type: "fix", text: "Discagem IA: prompt usava 'fornecedor' em vez de 'certificadora' — corrigido em todas as ocorrências (abertura, diagnóstico, objeção)" },
      { type: "melhoria", text: "Discagem IA: lista de certificadoras adicionada ao prompt — Certisign, Soluti, Safeweb, Serasa Experian, Valid, SERPRO, DigitalSign, Sincor, BR RFB, Receita Federal, Caixa, Imprensa Oficial, Justiça, Defesa, Presidência, Prodemge, CNDL, Fenacon, OAB, Notarial. Agente reconhece quando o contato menciona qualquer uma, destaca que Safeweb é a certificadora da Leal Cert, e usa as outras como ponto de comparação sem criticar" },
    ],
  },
  {
    date: "16/08/2026",
    version: "1.41",
    changes: [
      { type: "fix", text: "Discagem IA: call travava indefinidamente quando contato ficava em silêncio ou dizia algo incompreensível — Deepgram nunca disparava speech_final e o agente nunca voltava a falar. Adicionado timeout de 20 segundos: se nenhum áudio audível for detectado, o sistema injeta [SEM_VOZ] no pipeline e o agente reage naturalmente ('Olá? Está me ouvindo?')" },
      { type: "fix", text: "Discagem IA: Deepgram disparando speech_final com transcript vazio (ruído/murmúrio) causava retorno silencioso sem redirecionamento. Após 2 transcripts vazios consecutivos, o sistema trata como silêncio e retoma a conversa" },
      { type: "melhoria", text: "Discagem IA: prompt atualizado para lidar com [SEM_VOZ] — agente verifica a linha de forma natural e encerra educadamente após 3+ tentativas sem resposta" },
    ],
  },
  {
    date: "16/08/2026",
    version: "1.40",
    changes: [
      { type: "fix", text: "Discagem IA: provider padrão 'cartesia' hardcoded ignorava ElevenLabs mesmo com chave configurada — test-call e criação de campanhas agora herdam o provider das configurações globais (discagem_tts_fallback)" },
      { type: "fix", text: "Discagem IA: formulário de nova campanha inicializava ttsProvider='cartesia' sempre — agora inicia com 'elevenlabs' refletindo o que está configurado" },
    ],
  },
  {
    date: "16/08/2026",
    version: "1.39",
    changes: [
      { type: "fix", text: "Discagem IA: transcrição das ligações nunca era salva em modo stream — Twilio envia eventos para cada mudança de estado (ringing, in-progress…) e o histórico era apagado antes de 'completed'. Corrigido: só processa eventos terminais (completed/failed/no-answer/busy)" },
      { type: "fix", text: "Discagem IA: silêncio de 4-5s após o contato falar — stream mode agora envia TwiML inline com filler de áudio antes de redirecionar para /reply, eliminando pausa em branco" },
      { type: "fix", text: "Discagem IA: ElevenLabs selecionado mas Cartesia sendo usado sem aviso — sistema agora loga exatamente o que falta (chave de API ou Voice ID) ao pular um provider" },
      { type: "fix", text: "Discagem IA: fillers de áudio usavam palavras proibidas pelo prompt ('Claro.', 'Com certeza.', 'Ok.') — substituídos por sons naturais de pensamento ('Hmm...', 'Aham.', 'Deixa eu ver.')" },
      { type: "melhoria", text: "Discagem IA: prompt atualizado para lidar com 'Sim, sou eu' (confirmação sem nome) — agente não tenta inserir '[Nome]' e vai direto ao motivo da ligação de forma natural" },
    ],
  },
  {
    date: "16/08/2026",
    version: "1.38",
    changes: [
      { type: "melhoria", text: "Discagem IA: integração com Twilio Media Streams + Deepgram STT — áudio flui em tempo real via WebSocket, transcrição começa enquanto a pessoa ainda fala" },
      { type: "melhoria", text: "Discagem IA: latência de resposta reduzida — Deepgram detecta fim de fala em ~500ms de silêncio vs ~1s do Gather anterior; pipeline IA+TTS dispara imediatamente" },
      { type: "melhoria", text: "Discagem IA: fallback automático para modo Gather (Twilio STT) caso a chave do Deepgram não esteja configurada — nenhuma campanha quebra" },
      { type: "melhoria", text: "Discagem: estado de conversa movido para módulo compartilhado (conversation-state.ts) — pipeline de voz mais robusto e sem duplicação de lógica" },
    ],
  },
  {
    date: "16/08/2026",
    version: "1.37",
    changes: [
      { type: "melhoria", text: "Discagem: abertura completamente reescrita — agente agora cumprimenta com 'Bom dia/Boa tarde', apresenta nome E empresa na primeira fala e pergunta 'Com quem eu falo?'" },
      { type: "melhoria", text: "Discagem: fluxo pós-nome definido — ao ouvir o nome, agente reage com cordialidade, confirma se é o responsável pelos certificados e só então apresenta o motivo da ligação" },
      { type: "fix", text: "Discagem: abertura genérica sem apresentação foi eliminada — era percebida como grossa e despreparada" },
      { type: "melhoria", text: "Discagem: tabela de ligações agora exibe duração real e Call SID clicável (link direto para o Twilio) para análise de cada chamada" },
      { type: "fix", text: "Discagem: duração ficava zerada quando o reconciliador fechava a call — agora busca o valor real da API do Twilio antes de salvar" },
      { type: "melhoria", text: "Discagem IA: saudação agora é calculada dinamicamente pelo horário de Brasília — Bom dia até 12h, Boa tarde até 18h, Boa noite após 18h" },
      { type: "fix", text: "Discagem IA: proibidos fillers isolados ('Sim.', 'Entendo.', 'Certo.', 'Ok.') no início de respostas — soavam robóticos e sem sentido ao telefone" },
    ],
  },
  {
    date: "16/08/2026",
    version: "1.36",
    changes: [
      { type: "fix", text: "Discagem: tela ficava presa em 'Em conversa' após desligar — causa raiz: rota de teste não gravava started_at no banco, fazendo o reconciliador nunca encontrar a call" },
      { type: "fix", text: "Discagem: rota /test-call agora salva started_at ao marcar 'dialing'; webhook de voz usa COALESCE para garantir que started_at nunca fique NULL" },
      { type: "fix", text: "Discagem: reconciliador agora reconcilia calls com started_at NULL imediatamente (além das >20s), cobrindo qualquer call perdida por esse bug" },
      { type: "fix", text: "Discagem: reconciliador força hangup no Twilio para calls presas >3 min em 'in_progress' (Gather TwiML aberto sem resposta)" },
      { type: "fix", text: "Discagem: reconciliador corrigia 'Completed' → 'Não atendeu' — agora mapeia corretamente como 'Atendida'" },
    ],
  },
  {
    date: "16/08/2026",
    version: "1.35",
    changes: [
      { type: "fix", text: "Discagem: erro de autenticação Twilio aparecia como 'crédito esgotado' — agora exibe mensagem correta pedindo para verificar Account SID e Auth Token" },
      { type: "fix", text: "Discagem: número inválido (sem código de país) aparecia como 'crédito esgotado' — agora exibe mensagem clara pedindo formato E.164" },
      { type: "fix", text: "Discagem: geo-permission bloqueada no Twilio agora exibe mensagem clara orientando habilitar o país em console.twilio.com" },
      { type: "fix", text: "Discagem: número sem código de país agora recebe +55 automaticamente (brasileiro) ou +1 (americano com 10 dígitos)" },
      { type: "fix", text: "Discagem: ligação ficava presa em 'Discando' para sempre quando havia erro de crédito/auth — agora é marcada como 'Falhou' corretamente antes de pausar a campanha" },
      { type: "fix", text: "Discagem: modelo Cartesia 'sonic-multilingual' descontinuado — atualizado para 'sonic-2'; IA voltou a falar durante as ligações" },
      { type: "fix", text: "Discagem: URL de callback do Twilio usava variável de ambiente vazia em vez do hostname configurado nas Settings — ligação conectava mas desligava sem áudio" },
      { type: "fix", text: "Discagem: reconciliador de status reduzido de 5 para 1 minuto — tela atualiza em até 60s após desligar" },
      { type: "melhoria", text: "Discagem: abertura da IA reformulada para ser mais natural — primeira fala curta, adapta tom entre secretária e decisor, reage ao que a pessoa diz em vez de seguir roteiro fixo" },
      { type: "fix", text: "Discagem: TTS pronunciava 'LealCert' como 'Leocert' — corrigido para 'Leal Cert' em todo o prompt" },
      { type: "fix", text: "Discagem: IA perguntava de novo quem é o responsável mesmo após a pessoa confirmar 'é ele mesmo' — instrução anti-repetição adicionada" },
      { type: "fix", text: "Discagem: fillers 'Sim, sim.' e 'Deixa eu ver.' substituídos por 'Com certeza.' e 'Aham.' que soam mais naturais no contexto" },
    ],
  },
  {
    date: "14/08/2026",
    version: "1.34",
    changes: [
      { type: "fix", text: "Marketing: total de contatos da campanha estava sendo sobrescrito com os 'restantes' a cada retomada — corrigido para sempre refletir enviados + restantes" },
      { type: "fix", text: "Bounces: rota sem try-catch fazia o frontend ficar em 'Carregando...' eternamente quando a query falhava — agora retorna erro 500 com detalhe" },
      { type: "fix", text: "Bounces: query reescrita com DISTINCT ON eliminando LATERAL JOIN que causava falha silenciosa em produção" },
      { type: "novo", text: "Visitas ao Site: filtro por país — dropdown no topo, clique no card do país ou clique direto na coluna de localização da tabela filtram tudo instantaneamente" },
      { type: "fix", text: "Marketing: jitter de ±30% no intervalo entre lotes causava envio até 43% acima do configurado — corrigido para ±5%" },
      { type: "fix", text: "Marketing: fila de domínio próprio sem intervalo configurado enviava tudo sem pausa — agora usa fallback seguro" },
    ],
  },
  {
    date: "13/08/2026",
    version: "1.32",
    changes: [
      { type: "novo", text: "Rastreamento de visitas ao site: cada página visitada registra IP, geolocalização (país, cidade, provedor), dispositivo, sessão e usuário logado (se houver)" },
      { type: "novo", text: "Painel 'Visitas ao Site' no admin: cards de resumo (total, IPs únicos, sessões, usuários logados), top páginas com barras de progresso, por país com bandeira, por dispositivo" },
      { type: "novo", text: "Tabela de visitas recentes com filtro por página clicando no gráfico, paginação e filtro por período (hoje / 7 dias / 30 dias)" },
      { type: "melhoria", text: "IDs de voz TTS (Cartesia/ElevenLabs) por agente (Willian e Aline) agora configuráveis na tela de Settings — não mais hardcoded no código" },
      { type: "fix", text: "Usuário com role 'vendedor' aparecia como 'Cliente' na sidebar — exibe corretamente 'Vendedor'" },
    ],
  },
  {
    date: "03/08/2026",
    version: "1.31",
    changes: [
      { type: "novo", text: "Configurações → aba Discagem: Twilio (SID, token, número, URL pública), Cartesia (chave + Voice ID), ElevenLabs (chave + Voice ID), Deepgram (STT)" },
      { type: "novo", text: "Fallback automático de IA: se DeepSeek esgotar crédito → Claude → GPT → pausa com alerta; ordem configurável por campanha" },
      { type: "novo", text: "Fallback automático de TTS: se Cartesia esgotar crédito → ElevenLabs → pausa com alerta; ordem configurável por campanha" },
      { type: "melhoria", text: "Todas as chaves de API da Discagem agora são salvas no banco (Settings) em vez de variáveis de ambiente — gerenciamento via UI admin" },
      { type: "melhoria", text: "Twilio e TTS leem credenciais do banco em tempo real com cache 30s; invalidação automática ao salvar configurações" },
      { type: "novo", text: "Fillers de voz pré-gerados (\"Entendi.\", \"Certo.\", \"Um momento.\", etc.): tocados imediatamente ao receber a fala do contato enquanto IA+TTS processam em paralelo — latência percebida <0.5s" },
      { type: "novo", text: "Script completo do agente comercial LealCert inserido: 45 seções cobrindo abertura, diagnóstico, objeções, fechamento e conformidade — adaptado para voz (respostas curtas em áudio)" },
      { type: "novo", text: "Dois agentes de voz configurados: Willian (masculino) e Aline (feminino) — cada campanha seleciona o agente; voz TTS ajustada automaticamente por agente" },
      { type: "novo", text: "Filtro de DDD por campanha: seletor visual com todos os DDDs do Brasil organizados por região e estado (Sudeste, Sul, Centro-Oeste, Nordeste, Norte); seleção rápida por estado ou região inteira; chips removíveis no sumário" },
      { type: "novo", text: "Relatório de contatos da discagem: aba dedicada com filtro por período (Hoje / 7 dias / 30 dias / Tudo), cards de resumo (contatos únicos, atenderam, não atenderam, taxa), tabela por contato com número de tentativas, duração total acumulada e campanhas" },
      { type: "novo", text: "Agente de discagem: número WhatsApp (17) 3176-0105 injetado no script como contato oficial de suporte ao cliente; conteúdo do site lealcert.com.br pré-carregado no prompt (cache 4h) para responder dúvidas não cobertas pelo script" },
      { type: "novo", text: "Fluxo de e-mail de follow-up na discagem: agente captura e-mail via [REGISTRAR_EMAIL:], salva na ligação; botão 'Enviar e-mail' no detalhe da ligação envia HTML via SMTP com material da parceria" },
    ],
  },
  {
    date: "03/08/2026",
    version: "1.30",
    changes: [
      { type: "novo", text: "Sistema de Discagem Automática com IA: agentes autônomos ligam para contatos via Twilio + Claude/DeepSeek + Cartesia/ElevenLabs" },
      { type: "novo", text: "Painel de campanhas com dashboard em tempo real: ligações ativas, fila, taxa de atendimento e histórico completo" },
      { type: "novo", text: "Alerta automático quando créditos de qualquer API esgotam: sistema pausa e indica qual API precisa ser recarregada" },
      { type: "novo", text: "Alvos de discagem configuráveis: todos os contatos, clientes, contadores, número avulso ou ligação de teste imediata" },
      { type: "novo", text: "Janela de horário editável por campanha (dias da semana + manhã/tarde); retentativa automática no próximo dia útil" },
      { type: "novo", text: "Transcrição e player de gravação integrados para auditoria de cada ligação finalizada" },
    ],
  },
  {
    date: "02/08/2026",
    version: "1.29",
    changes: [
      { type: "fix", text: "Remoção de usuários corrigida: deleção travava em FK de loyalty, cartelas e vendedor_id — todas as dependências agora limpas antes de excluir" },
      { type: "fix", text: "Tabela vendedor_pagamentos agora criada automaticamente no startup (ausência causava erro 500 em /admin/vendedores)" },
      { type: "fix", text: "Vendedores não aparecem mais na lista de /admin/usuários — gerenciados exclusivamente em /admin/vendedores" },
      { type: "novo", text: "Botão 'Reenviar E-mail' (ícone envelope) na lista de vendedores: reenvia o e-mail de boas-vindas com nova senha provisória a qualquer momento" },
      { type: "novo", text: "Vendedor recebe e-mail automático quando um novo contador se cadastra pelo seu link de afiliado" },
    ],
  },
  {
    date: "02/08/2026",
    version: "1.28",
    changes: [
      { type: "novo", text: "Controle de pagamentos de comissão: admin registra pagamentos realizados a cada vendedor (valor, data, observação) diretamente em /admin/vendedores" },
      { type: "novo", text: "Visão consolidada de comissões na lista de vendedores: colunas Saldo Bruto, Já Pago e A Receber; cards de total a pagar e total já pago para todos os vendedores" },
      { type: "novo", text: "Tela Ganhos do vendedor exibe saldo bruto, total pago e saldo a receber lado a lado" },
    ],
  },
  {
    date: "02/08/2026",
    version: "1.28",
    changes: [
      { type: "novo", text: "Painel do vendedor — aba Meus Ganhos exibe tabela de 'Pagamentos Recebidos' com data, valor e observação, total no rodapé, e filtros de período (data início/fim) que atualizam a tabela reativamente" },
    ],
  },
  {
    date: "02/08/2026",
    version: "1.27",
    changes: [
      { type: "fix", text: "Pedido concluído: botões 'Reagendar' e 'Cancelar Agendamento' (GAR e Safeweb) são ocultados quando o status é 'Concluído' — o card de agendamento continua visível com as informações do atendimento" },
      { type: "fix", text: "Avaliações: campo 'Profissão' no popup de feedback agora detecta corretamente o tipo do usuário — clientes aparecem como 'Cliente' e contadores como 'Contador' (antes hardcoded como 'Contador' para todos)" },
      { type: "novo", text: "Vendedores: ao registrar um pagamento de comissão pelo painel admin, o vendedor recebe automaticamente um e-mail com o valor, data e observação do pagamento" },
    ],
  },
  {
    date: "02/08/2026",
    version: "1.26",
    changes: [
      { type: "novo",     text: "Sistema de Vendedores: admin cadastra vendedores com comissão configurável (valor por cert + bônus por meta). Código de afiliado único gerado automaticamente" },
      { type: "novo",     text: "Painel do Vendedor (/vendedor): dashboard com total de contadores, certificados emitidos (hoje/mês/ano), saldo de ganhos + bônus e ranking top-10 contadores" },
      { type: "novo",     text: "Vendedor pode cadastrar contadores diretamente (/vendedor/contadores) com senha provisória enviada por e-mail e reset de senha individual" },
      { type: "novo",     text: "Relatório de vendas do vendedor (/vendedor/relatorio): lista pedidos concluídos dos seus contadores com filtro por período e busca" },
      { type: "novo",     text: "Extrato de ganhos (/vendedor/ganhos): histórico mensal, progresso para próximo bônus com barra visual e saldo total acumulado" },
      { type: "novo",     text: "Link de afiliado (/register?ref=CÓDIGO): ao cadastrar via link, novo contador é automaticamente vinculado ao vendedor" },
      { type: "novo",     text: "Admin /admin/vendedores: listagem, criar/editar, copiar link de afiliado, reset de senha e remoção de vendedores" },
      { type: "novo",     text: "E-mails de boas-vindas: vendedor recebe e-mail com senha provisória ao ser criado; contador cadastrado pelo vendedor recebe e-mail de acesso" },
    ],
  },
  {
    date: "02/08/2026",
    version: "1.25",
    changes: [
      { type: "novo",     text: "Checkout: contadores com cartela de fidelidade completa veem opção '⭐ Certificado Cortesia' no topo da lista de pagamentos — R$ 0,00, sem necessidade de dados de pagamento" },
      { type: "novo",     text: "Botão 'Sou Contador' em destaque dourado no menu da landing page — leva direto para a página /contadores" },
      { type: "fix",      text: "Ícones do app (favicon, PWA 192×512, apple-touch-icon) substituídos pelo logo oficial LealCert com fundo branco arredondado" },
    ],
  },
  {
    date: "02/08/2026",
    version: "1.24",
    changes: [
      { type: "novo",     text: "Programa de Fidelidade: a cada 10 certificados emitidos, o contador ganha 1 certificado grátis (cortesia). Cartelas visuais com slots 1–10 preenchidos automaticamente após emissão" },
      { type: "novo",     text: "Página /fidelidade para contadores: visualiza cartelas ativas, disponíveis, usadas e banner de cortesia com botão direto para checkout" },
      { type: "novo",     text: "Admin /admin/fidelidade: painel com 2 abas — todos os contadores pontuando (ajuste manual de slots clicando nos botões) e lista de cortesias utilizadas" },
      { type: "melhoria", text: "Dashboard: cards corrigidos — contagem de contadores usa userType correto, adicionados cards 'Clientes (total)' e 'Novos clientes'; PAID_STATUSES expandido para incluir pedidos em validação e emitidos" },
      { type: "fix",      text: "Dashboard: filtros de top compradores e tiers agora usam userType para distinguir contadores de clientes (antes a lógica estava invertida)" },
      { type: "melhoria", text: "Sidebar: link 'Fidelidade' aparece automaticamente para contadores na seção 'Benefícios'; admin ganha item 'Fidelidade' no painel de administração" },
    ],
  },
  {
    date: "02/08/2026",
    version: "1.23",
    changes: [
      { type: "fix", text: "GAR: scheduler agora atualiza o status de pedidos que já têm protocolo — antes o sync parava em 'Agendado' e nunca detectava o certificado emitido automaticamente" },
    ],
  },
  {
    date: "02/08/2026",
    version: "1.22",
    changes: [
      { type: "novo", text: "Página de captação para contadores (/contadores): funil de vendas com preço de R$ 90/certificado, programa de cortesia a cada 10 emitidos, benefícios, portal de gestão e requisitos — com CTA para cadastro pré-selecionado como contador" },
      { type: "melhoria", text: "Cadastro: URL ?userType=contador pré-seleciona automaticamente o tipo 'Contador' na tela de registro" },
      { type: "melhoria", text: "Landing page: link 'É contador?' agora aponta para a página /contadores em vez de direto para o login" },
    ],
  },
  {
    date: "22/07/2026",
    version: "1.21",
    changes: [
      { type: "melhoria", text: "E-mail e WhatsApp: intervalos entre envios agora têm variação aleatória de ±30% (ex: pause de 60s vira 42–78s) — reduz risco de detecção de spam por padrão regular" },
      { type: "novo",     text: "E-mail: botão 'Editar velocidade' aparece em campanhas ativas — permite alterar lote e intervalo sem parar o envio; aplica no próximo lote automaticamente" },
      { type: "novo",     text: "WhatsApp: botão 'Velocidade' aparece em campanhas ativas — permite alterar msgs/minuto sem pausar; mostra preview do intervalo resultante com jitter" },
      { type: "novo",     text: "API: novos endpoints PATCH /marketing/campaigns/:id/rate e PATCH /marketing/wa/campaigns/:id/rate para ajuste de velocidade ao vivo" },
    ],
  },
  {
    date: "22/07/2026",
    version: "1.20",
    changes: [
      { type: "novo",    text: "E-mail e WhatsApp: quando o envio pausa por horário comercial, o motivo aparece na tela (ex: 'Envio pausado · Horário comercial (8h–18h)')" },
      { type: "fix",     text: "WhatsApp: dispatch não trava mais quando a Evolution API demora para responder — timeout de 20s garante que o loop segue para o próximo contato" },
      { type: "fix",     text: "WhatsApp: se ocorrer qualquer erro inesperado durante o envio, a campanha passa para 'Pausada' automaticamente — nunca fica presa em 'Enviando' sem fazer nada" },
      { type: "fix",     text: "E-mail: total de contatos agora reflete apenas o provedor selecionado — selecionar só UOL mostra ~3.500, não 92.000" },
      { type: "fix",     text: "WhatsApp: campanha não fica mais 'Pausada' incorretamente — horário comercial só bloqueia quando configurado; corrigida leitura de valores antigos do banco" },
      { type: "melhoria", text: "WhatsApp: pausa manual é detectada em até 2 segundos durante o intervalo entre envios — não espera mais o temporizador inteiro para reagir" },
      { type: "novo",    text: "WhatsApp: countdown ao vivo mostra exatamente quantos segundos faltam para o próximo envio (ex: '· próximo em 47s')" },
    ],
  },
  {
    date: "22/07/2026",
    version: "1.19",
    changes: [
      { type: "fix", text: "Filtro de provedor (Gmail, Outlook, etc.) agora é salvo corretamente — ao retomar ou agendar a campanha, somente os provedores selecionados recebem" },
      { type: "fix", text: "Pausa manual agora é respeitada pelo scheduler — campanha pausada pelo usuário não volta sozinha mais" },
      { type: "fix", text: "Faixa de contatos (De/Até) agora é salva e restaurada corretamente em disparo imediato, agendado e retomada" },
      { type: "fix", text: "Auto-retomada por horário comercial agora restaura corretamente filtro de provedores, faixa de contatos e demais opções configuradas" },
    ],
  },
  {
    date: "21/07/2026",
    version: "1.18",
    changes: [
      { type: "melhoria", text: "Velocidade de envio agora se aplica a TODOS os provedores (Gmail, Outlook, Yahoo, UOL/BOL e domínio próprio) — sem mais regras fixas ignoradas" },
      { type: "melhoria", text: "Fallback de segurança por provedor: se lote/intervalo não configurado, usa valores conservadores (ex: Gmail 10 e-mails a cada 12 min)" },
      { type: "fix",      text: "Scheduler de retomada por horário comercial agora restaura corretamente o lote/intervalo configurado — não caia mais no fallback ao retomar" },
      { type: "novo",     text: "Contatos: seleção global — selecione toda a página e um banner aparece para selecionar TODOS os X contatos de uma vez; exclusão em lote respeita filtros ativos" },
      { type: "fix",      text: "Logo agora visível em todos os fundos escuros: brilho aumentado + glow azul em login, cadastro, sidebar e demais telas" },
      { type: "melhoria", text: "Validação de e-mails 5× mais rápida: 5 contatos em paralelo, timeout SMTP reduzido para 3s e apenas 1 host MX testado por contato" },
      { type: "fix",      text: "Timeout SMTP individual mantém contato como 'unknown' no banco — não marca como válido" },
    ],
  },
  {
    date: "20/07/2026",
    version: "1.17",
    changes: [
      { type: "fix",      text: "Campanhas WhatsApp pausadas manualmente não são mais retomadas automaticamente pelo scheduler" },
      { type: "fix",      text: "Loop duplo de disparo eliminado: retomada via scheduler não criava segundo loop quando o original ainda estava ativo" },
      { type: "fix",      text: "Sem rate limit configurado, campanhas WA disparavam tudo de uma vez — padrão agora é 20 msg/min (3s entre envios)" },
      { type: "novo",     text: "Botão 'Cancelar' nas campanhas WA em andamento ou pausadas — interrompe o disparo e permite excluir a campanha depois" },
      { type: "fix",      text: "Campanhas canceladas desapareciam da lista — agora aparecem na seção 'Canceladas' com botão Excluir disponível" },
      { type: "fix",      text: "Validação de e-mails parava em 500 contatos — agora processa em lotes de 200 em loop até validar todos os contatos pendentes" },
      { type: "fix",      text: "Validação SMTP lenta e sem erros smtp_invalid: probe busca domínio não catch-all corretamente; timeout SMTP mantém contato como 'unknown' no banco (não marca como válido) e exclui da fila desta execução" },
    ],
  },
  {
    date: "20/07/2026",
    version: "1.16",
    changes: [
      { type: "fix",      text: "Validação de e-mails não travava mais o servidor: endpoint agora roda em background e retorna imediatamente" },
      { type: "melhoria", text: "Verificação SMTP testa portas 25, 587 e 465 em sequência — funciona mesmo com provedores que bloqueiam a porta 25" },
      { type: "melhoria", text: "Sondagem inicial testa todas as portas antes de declarar SMTP bloqueado" },
      { type: "melhoria", text: "Progresso da validação exibido em tempo real no botão (ex: 'Validando… 120/500')" },
    ],
  },
  {
    date: "20/07/2026",
    version: "1.15",
    changes: [
      { type: "melhoria", text: "Dockerfile otimizado: camada de dependências cacheada separadamente — deploys futuros até 5× mais rápidos quando só o código muda" },
    ],
  },
  {
    date: "20/07/2026",
    version: "1.14",
    changes: [
      { type: "novo",     text: "Log de novidades: histórico de atualizações exibido no sidebar" },
      { type: "novo",     text: "Versão do build exibida no rodapé do sidebar" },
      { type: "fix",      text: "Filtro 'Bounce' na listagem de contatos não retornava resultados" },
      { type: "melhoria", text: "Validação de e-mail (SMTP + MX) executada automaticamente antes de cada envio de campanha" },
      { type: "melhoria", text: "Validação manual agora usa verificação SMTP para domínios corporativos (detecta caixa inexistente)" },
      { type: "melhoria", text: "Dois tipos de inválido exibidos: 'Sem servidor MX' (domínio inexistente) e 'smtp_invalid' (caixa não existe)" },
    ],
  },
  {
    date: "19/07/2026",
    version: "1.13",
    changes: [
      { type: "fix",      text: "Restauração de 80.186 contatos marcados incorretamente como bounce por erro de API key" },
      { type: "fix",      text: "Regex de bounce permanente removeu palavras genéricas que bloqueavam contatos por falha de autenticação SMTP" },
      { type: "fix",      text: "Webhook Evolution retornando 403 — rota /wa/webhook/* agora ignora autenticação de admin" },
      { type: "fix",      text: "Campanhas ignoravam intervalo de envio e disparavam todos os e-mails de uma vez" },
      { type: "melhoria", text: "Rate-limit (lote, intervalo, horário, dias) salvo no banco ao agendar campanha" },
    ],
  },
  {
    date: "18/07/2026",
    version: "1.12",
    changes: [
      { type: "segurança", text: "Sistema de segurança por IP: 3 tentativas erradas bloqueiam login, Brasil desbloqueia em 4h, IP novo requer código por e-mail" },
      { type: "novo",      text: "Dashboard de IP bloqueados no painel admin" },
    ],
  },
  {
    date: "17/07/2026",
    version: "1.11",
    changes: [
      { type: "fix",      text: "Chat Hope: login usa hash de senha (não senha em texto); senha redactada antes de salvar no banco" },
      { type: "fix",      text: "Agendamento inline no chat verifica propriedade do pedido antes de reservar slot" },
      { type: "melhoria", text: "Chat busca pedidos ativos ao abrir e exibe botões 'Enviar Docs' e 'Agendar' no menu inicial" },
    ],
  },
  {
    date: "16/07/2026",
    version: "1.10",
    changes: [
      { type: "fix",      text: "Agendamento GAR: parâmetros na ordem correta; API retorna [] em sucesso" },
      { type: "fix",      text: "ErrorCode 888 GAR: datas enviadas em DD/MM/YYYY via normalizeDateForGar()" },
      { type: "novo",     text: "Scheduler syncGarProtocols a cada 5min recupera protocolos de pedidos perdidos" },
    ],
  },
  {
    date: "14/07/2026",
    version: "1.9",
    changes: [
      { type: "novo",     text: "Integração Safeweb: toggle de provedor (Gestão AR / Safeweb) nas configurações" },
      { type: "fix",      text: "Agenda Safeweb usa host diferente da API principal; token JWE sem prefixo Bearer" },
      { type: "fix",      text: "orderRow() passou a incluir campos GAR e Safeweb retornados ao frontend" },
    ],
  },
];

const TYPE_CONFIG: Record<UpdateType, { label: string; className: string }> = {
  fix:       { label: "Fix",       className: "bg-red-100 text-red-700 border-red-200" },
  novo:      { label: "Novo",      className: "bg-blue-100 text-blue-700 border-blue-200" },
  melhoria:  { label: "Melhoria",  className: "bg-green-100 text-green-700 border-green-200" },
  segurança: { label: "Segurança", className: "bg-purple-100 text-purple-700 border-purple-200" },
};

export function ChangelogButton({ collapsed }: { collapsed: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={collapsed ? "Novidades" : undefined}
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent ${collapsed ? "justify-center px-0" : ""}`}
      >
        <Sparkles className="h-4 w-4 shrink-0 text-yellow-400" />
        {!collapsed && <span className="truncate">Novidades</span>}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-full sm:max-w-md p-0 flex flex-col">
          <SheetHeader className="px-6 pt-6 pb-4 border-b">
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-yellow-400" />
              Log de Atualizações
            </SheetTitle>
            <p className="text-xs text-muted-foreground">Histórico de melhorias e correções do sistema</p>
          </SheetHeader>

          <ScrollArea className="flex-1 px-6 py-4">
            <div className="space-y-6">
              {CHANGELOG.map((entry, i) => (
                <div key={i}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-bold text-foreground">{entry.date}</span>
                    <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">v{entry.version}</span>
                    {i === 0 && <Badge className="text-[10px] px-1.5 py-0 bg-yellow-400 text-yellow-900 border-0">Mais recente</Badge>}
                  </div>
                  <ul className="space-y-2">
                    {entry.changes.map((change, j) => (
                      <li key={j} className="flex items-start gap-2 text-sm">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0 mt-0.5 ${TYPE_CONFIG[change.type].className}`}>
                          {TYPE_CONFIG[change.type].label}
                        </span>
                        <span className="text-muted-foreground leading-snug">{change.text}</span>
                      </li>
                    ))}
                  </ul>
                  {i < CHANGELOG.length - 1 && <div className="border-t mt-4" />}
                </div>
              ))}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </>
  );
}
