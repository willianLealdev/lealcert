import { useState } from "react";
import { useListIpLogs, useListIpBlocks, useUnblockIp, useBanIp, useUnbanIp } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldAlert, ShieldCheck, Globe, MapPin, Clock, Ban, Unlock, ShieldOff,
  CheckCircle, XCircle, AlertTriangle, Search, RefreshCw, Loader2,
} from "lucide-react";

function actionBadge(action: string) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    login_success: { label: "Login OK", variant: "default" },
    login_fail: { label: "Senha errada", variant: "destructive" },
    login_blocked: { label: "Bloqueado", variant: "destructive" },
    register: { label: "Cadastro", variant: "secondary" },
  };
  const info = map[action] ?? { label: action, variant: "outline" as const };
  return <Badge variant={info.variant}>{info.label}</Badge>;
}

function CountryFlag({ code }: { code?: string | null }) {
  if (!code || code.length !== 2) return <Globe className="h-4 w-4 text-slate-400" />;
  const flag = code.toUpperCase().replace(/./g, c => String.fromCodePoint(0x1F1E0 - 65 + c.charCodeAt(0)));
  return <span title={code}>{flag}</span>;
}

export default function AdminIpSecurity() {
  const { toast } = useToast();
  const [ipFilter, setIpFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [page, setPage] = useState(1);
  const [bannedFilter, setBannedFilter] = useState<"all" | "blocked" | "banned">("all");

  const logsQuery = useListIpLogs({
    ip: ipFilter || undefined,
    action: actionFilter || undefined,
    page,
    limit: 50,
  });

  const blocksQuery = useListIpBlocks(
    bannedFilter === "all" ? {} : { banned: bannedFilter === "banned" ? "true" : "false" },
  );

  const unblockMutation = useUnblockIp({
    mutation: {
      onSuccess: (_, vars) => {
        toast({ title: "IP desbloqueado", description: `IP ${vars.ip} desbloqueado com sucesso.` });
        blocksQuery.refetch();
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? "Erro ao desbloquear IP.";
        toast({ title: "Erro", description: msg, variant: "destructive" });
      },
    },
  });

  const banMutation = useBanIp({
    mutation: {
      onSuccess: (_, vars) => {
        toast({ title: "IP banido", description: `IP ${vars.ip} banido permanentemente.`, variant: "destructive" });
        blocksQuery.refetch();
        logsQuery.refetch();
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? "Erro ao banir IP.";
        toast({ title: "Erro", description: msg, variant: "destructive" });
      },
    },
  });

  const unbanMutation = useUnbanIp({
    mutation: {
      onSuccess: (_, vars) => {
        toast({ title: "Banimento revertido", description: `IP ${vars.ip} desbloqueado.` });
        blocksQuery.refetch();
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? "Erro ao reverter banimento.";
        toast({ title: "Erro", description: msg, variant: "destructive" });
      },
    },
  });

  const logs = logsQuery.data?.logs ?? [];
  const total = logsQuery.data?.total ?? 0;
  const blocks = blocksQuery.data ?? [];

  const blockedCount = blocks.filter(b => !b.isBanned).length;
  const bannedCount = blocks.filter(b => b.isBanned).length;
  const failedToday = logs.filter(l => {
    const today = new Date();
    const d = new Date(l.createdAt);
    return !l.success && d.getDate() === today.getDate() && d.getMonth() === today.getMonth();
  }).length;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <ShieldAlert className="h-6 w-6 text-blue-600" />
          Segurança de IP
        </h1>
        <p className="text-slate-500 text-sm mt-1">Monitoramento de acessos, bloqueios e banimentos por endereço IP.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Bloqueados</p>
            <p className="text-3xl font-bold text-amber-600 mt-1">{blockedCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Banidos</p>
            <p className="text-3xl font-bold text-red-600 mt-1">{bannedCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Falhas Hoje</p>
            <p className="text-3xl font-bold text-slate-700 mt-1">{failedToday}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Logs (30d)</p>
            <p className="text-3xl font-bold text-blue-600 mt-1">{total}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="blocks">
        <TabsList>
          <TabsTrigger value="blocks">
            IPs Bloqueados/Banidos
            {blocks.length > 0 && <span className="ml-1.5 bg-red-100 text-red-700 text-xs px-1.5 py-0.5 rounded-full">{blocks.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="logs">Histórico de Acessos</TabsTrigger>
        </TabsList>

        {/* ── Tab: Blocks ──────────────────────────────────────── */}
        <TabsContent value="blocks" className="space-y-4 mt-4">
          <div className="flex gap-2 flex-wrap">
            {(["all", "blocked", "banned"] as const).map(f => (
              <Button key={f} size="sm" variant={bannedFilter === f ? "default" : "outline"}
                onClick={() => setBannedFilter(f)}>
                {f === "all" ? "Todos" : f === "blocked" ? "Bloqueados" : "Banidos"}
              </Button>
            ))}
            <Button size="sm" variant="ghost" onClick={() => blocksQuery.refetch()} className="ml-auto">
              <RefreshCw className={`h-4 w-4 mr-1.5 ${blocksQuery.isFetching ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>

          {blocksQuery.isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
          ) : blocks.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-slate-400"><ShieldCheck className="h-10 w-10 mx-auto mb-3 text-green-500" />Nenhum IP bloqueado no momento.</CardContent></Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                        <th className="text-left px-4 py-3">IP</th>
                        <th className="text-left px-4 py-3">País</th>
                        <th className="text-left px-4 py-3">Status</th>
                        <th className="text-right px-4 py-3">Tentativas</th>
                        <th className="text-left px-4 py-3">Bloqueado em</th>
                        <th className="text-left px-4 py-3">Desbloqueio</th>
                        <th className="text-right px-4 py-3">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {blocks.map(block => (
                        <tr key={block.id} className={`hover:bg-slate-50 ${block.isBanned ? "bg-red-50/50" : ""}`}>
                          <td className="px-4 py-3 font-mono font-medium text-slate-800">{block.ip}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <CountryFlag code={block.countryCode} />
                              <span className="text-slate-600">{block.country ?? "—"}</span>
                              {block.city && <span className="text-slate-400 text-xs">({block.city})</span>}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {block.isBanned ? (
                              <Badge variant="destructive" className="gap-1"><Ban className="h-3 w-3" />Banido</Badge>
                            ) : block.isForeign ? (
                              <Badge variant="outline" className="gap-1 border-amber-300 text-amber-700"><Globe className="h-3 w-3" />Estrangeiro</Badge>
                            ) : (
                              <Badge variant="outline" className="gap-1 border-slate-300 text-slate-600"><Clock className="h-3 w-3" />Bloqueado</Badge>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-600">{block.attempts}</td>
                          <td className="px-4 py-3 text-slate-500 text-xs">
                            {new Date(block.blockedAt).toLocaleString("pt-BR")}
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-xs">
                            {block.isBanned ? <span className="text-red-500">Permanente</span>
                              : block.unblockAt ? new Date(block.unblockAt).toLocaleString("pt-BR")
                              : <span className="text-amber-600">Manual</span>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1.5 justify-end">
                              {block.isBanned ? (
                                <Button size="sm" variant="outline" className="text-green-700 border-green-300 hover:bg-green-50"
                                  onClick={() => unbanMutation.mutate({ ip: block.ip })}
                                  disabled={unbanMutation.isPending}>
                                  <Unlock className="h-3.5 w-3.5 mr-1" />Reverter
                                </Button>
                              ) : (
                                <>
                                  <Button size="sm" variant="outline" className="text-green-700 border-green-300 hover:bg-green-50"
                                    onClick={() => unblockMutation.mutate({ ip: block.ip })}
                                    disabled={unblockMutation.isPending}>
                                    <Unlock className="h-3.5 w-3.5 mr-1" />Desbloquear
                                  </Button>
                                  <Button size="sm" variant="outline" className="text-red-700 border-red-300 hover:bg-red-50"
                                    onClick={() => { if (confirm(`Banir permanentemente o IP ${block.ip}?`)) banMutation.mutate({ ip: block.ip }); }}
                                    disabled={banMutation.isPending}>
                                    <Ban className="h-3.5 w-3.5 mr-1" />Banir
                                  </Button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Tab: Logs ────────────────────────────────────────── */}
        <TabsContent value="logs" className="space-y-4 mt-4">
          <div className="flex gap-2 flex-wrap items-center">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input placeholder="Filtrar por IP..." value={ipFilter}
                onChange={e => { setIpFilter(e.target.value); setPage(1); }}
                className="pl-9 h-9" />
            </div>
            <select
              value={actionFilter}
              onChange={e => { setActionFilter(e.target.value); setPage(1); }}
              className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700"
            >
              <option value="">Todas as ações</option>
              <option value="login_success">Login OK</option>
              <option value="login_fail">Senha errada</option>
              <option value="login_blocked">Bloqueado</option>
              <option value="register">Cadastro</option>
            </select>
            <Button size="sm" variant="ghost" onClick={() => logsQuery.refetch()}>
              <RefreshCw className={`h-4 w-4 mr-1.5 ${logsQuery.isFetching ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>

          {logsQuery.isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
          ) : logs.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-slate-400">Nenhum log encontrado.</CardContent></Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                        <th className="text-left px-4 py-3">Horário</th>
                        <th className="text-left px-4 py-3">IP</th>
                        <th className="text-left px-4 py-3">País</th>
                        <th className="text-left px-4 py-3">Usuário</th>
                        <th className="text-left px-4 py-3">Ação</th>
                        <th className="text-center px-4 py-3">Status</th>
                        <th className="text-right px-4 py-3">Banir IP</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {logs.map(log => (
                        <tr key={log.id} className={`hover:bg-slate-50 ${log.blocked ? "bg-red-50/30" : ""}`}>
                          <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                            {new Date(log.createdAt).toLocaleString("pt-BR")}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{log.ip}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-1.5">
                              <CountryFlag code={log.countryCode} />
                              <span className="text-slate-500 text-xs">{log.country ?? "—"}</span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-slate-700 text-xs">
                            {log.userName ?? <span className="text-slate-400">{log.cpfCnpj ?? "—"}</span>}
                          </td>
                          <td className="px-4 py-2.5">{actionBadge(log.action)}</td>
                          <td className="px-4 py-2.5 text-center">
                            {log.success
                              ? <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                              : log.blocked
                              ? <AlertTriangle className="h-4 w-4 text-red-500 mx-auto" />
                              : <XCircle className="h-4 w-4 text-amber-500 mx-auto" />}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {!log.success && (
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-red-600 hover:bg-red-50"
                                onClick={() => { if (confirm(`Banir permanentemente o IP ${log.ip}?`)) banMutation.mutate({ ip: log.ip }); }}
                                disabled={banMutation.isPending}>
                                <Ban className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Pagination */}
                <div className="flex items-center justify-between px-4 py-3 border-t text-sm text-slate-500">
                  <span>Total: {total} registros (últimos 30 dias)</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Anterior</Button>
                    <span className="px-2 py-1 text-xs">Página {page}</span>
                    <Button size="sm" variant="outline" disabled={logs.length < 50} onClick={() => setPage(p => p + 1)}>Próxima</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
