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
