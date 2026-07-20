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
    date: "20/07/2026",
    version: "1.17",
    changes: [
      { type: "fix",      text: "Campanhas WhatsApp pausadas manualmente não são mais retomadas automaticamente pelo scheduler" },
      { type: "fix",      text: "Loop duplo de disparo eliminado: retomada via scheduler não criava segundo loop quando o original ainda estava ativo" },
      { type: "fix",      text: "Sem rate limit configurado, campanhas WA disparavam tudo de uma vez — padrão agora é 20 msg/min (3s entre envios)" },
      { type: "novo",     text: "Botão 'Cancelar' nas campanhas WA em andamento ou pausadas — interrompe o disparo e permite excluir a campanha depois" },
      { type: "fix",      text: "Campanhas canceladas desapareciam da lista — agora aparecem na seção 'Canceladas' com botão Excluir disponível" },
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
