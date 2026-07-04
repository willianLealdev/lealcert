import { useState } from "react";
import {
  useListIpLogs, useListIpBlocks, useUnblockIp, useBanIp, useUnbanIp,
  useAllowIp, useListIpWhitelist, useRemoveIpFromWhitelist, useAddIpToWhitelist,
  useRefreshIpGeo,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldAlert, ShieldCheck, Globe, MapPin, Clock, Ban, Unlock, ShieldOff,
  CheckCircle, XCircle, AlertTriangle, Search, RefreshCw, Loader2,
  ShieldPlus, Trash2, Plus,
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
  const [newIp, setNewIp] = useState("");
  const [newIpNotes, setNewIpNotes] = useState("");

  const logsQuery = useListIpLogs({
    ip: ipFilter || undefined,
    action: actionFilter || undefined,
    page,
    limit: 50,
  });

  const blocksQuery = useListIpBlocks(
    bannedFilter === "all" ? {} : { banned: bannedFilter === "banned" ? "true" : "false" },
  );

  const whitelistQuery = useListIpWhitelist();

  const refreshGeoMutation = useRefreshIpGeo({
    mutation: {
      onSuccess: (data) => {
        toast({ title: "✅ Países atualizados", description: `${data.updated} de ${data.total} IPs atualizados.` });
        logsQuery.refetch();
        blocksQuery.refetch();
      },
      onError: () => toast({ title: "Erro ao atualizar países", variant: "destructive" }),
    },
  });

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

  const allowMutation = useAllowIp({
    mutation: {
      onSuccess: (_, vars) => {
        toast({ title: "✅ IP autorizado", description: `${vars.ip} está na lista de permitidos e nunca será bloqueado.` });
        blocksQuery.refetch();
        whitelistQuery.refetch();
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? "Erro ao autorizar IP.";
        toast({ title: "Erro", description: msg, variant: "destructive" });
      },
    },
  });

  const addWhitelistMutation = useAddIpToWhitelist({
    mutation: {
      onSuccess: (_, vars) => {
        toast({ title: "✅ IP autorizado", description: `${vars.data.ip} adicionado à lista de permitidos.` });
        whitelistQuery.refetch();
        setNewIp("");
        setNewIpNotes("");
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? "Erro ao adicionar IP.";
        toast({ title: "Erro", description: msg, variant: "destructive" });
      },
    },
  });

  const removeWhitelistMutation = useRemoveIpFromWhitelist({
    mutation: {
      onSuccess: (_, vars) => {
        toast({ title: "IP removido", description: `${vars.ip} removido da lista de permitidos.` });
        whitelistQuery.refetch();
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? "Erro ao remover IP.";
        toast({ title: "Erro", description: msg, variant: "destructive" });
      },
    },
  });

  const logs = logsQuery.data?.logs ?? [];
  const total = logsQuery.data?.total ?? 0;
  const blocks = blocksQuery.data ?? [];
  const whitelist = whitelistQuery.data ?? [];

  const blockedCount = blocks.filter(b => !b.isBanned).length;
  const bannedCount = blocks.filter(b => b.isBanned).length;
  const failedToday = logs.filter(l => {
    const today = new Date();
    const d = new Date(l.createdAt);
    return !l.success && d.getDate() === today.getDate() && d.getMonth() === today.getMonth();
  }).length;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-blue-600" />
            Segurança de IP
          </h1>
          <p className="text-slate-500 text-sm mt-1">Monitoramento de acessos, bloqueios, banimentos e IPs autorizados.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refreshGeoMutation.mutate()}
          disabled={refreshGeoMutation.isPending}
          title="Atualiza o país de todos os registros que estão como Desconhecido"
        >
          {refreshGeoMutation.isPending
            ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            : <Globe className="h-4 w-4 mr-1.5" />}
          Atualizar países
        </Button>
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
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Autorizados</p>
            <p className="text-3xl font-bold text-green-600 mt-1">{whitelist.length}</p>
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
          <TabsTrigger value="whitelist">
            <ShieldCheck className="h-3.5 w-3.5 mr-1.5 text-green-600" />
            IPs Autorizados
            {whitelist.length > 0 && <span className="ml-1.5 bg-green-100 text-green-700 text-xs px-1.5 py-0.5 rounded-full">{whitelist.length}</span>}
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
                              {/* Botão Permitir — disponível tanto em bloqueados quanto banidos */}
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-blue-700 border-blue-300 hover:bg-blue-50"
                                onClick={() => {
                                  if (confirm(`Autorizar permanentemente o IP ${block.ip}?\n\nEste IP nunca será bloqueado novamente, mesmo após falhas de login.`))
                                    allowMutation.mutate({ ip: block.ip });
                                }}
                                disabled={allowMutation.isPending}
                                title="Autorizar permanentemente — nunca será bloqueado novamente"
                              >
                                <ShieldPlus className="h-3.5 w-3.5 mr-1" />Permitir
                              </Button>

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

        {/* ── Tab: Whitelist ───────────────────────────────────── */}
        <TabsContent value="whitelist" className="space-y-4 mt-4">
          <Card className="border-green-200 bg-green-50/40">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 text-green-800">
                <ShieldPlus className="h-4 w-4" />
                Autorizar novo IP manualmente
              </CardTitle>
              <p className="text-xs text-green-700">IPs autorizados nunca serão bloqueados, mesmo após múltiplas falhas de login.</p>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 flex-wrap">
                <Input
                  placeholder="Endereço IP (ex: 189.30.45.12)"
                  value={newIp}
                  onChange={e => setNewIp(e.target.value)}
                  className="flex-1 min-w-48 font-mono"
                />
                <Input
                  placeholder="Observação (opcional)"
                  value={newIpNotes}
                  onChange={e => setNewIpNotes(e.target.value)}
                  className="flex-1 min-w-48"
                />
                <Button
                  onClick={() => {
                    if (!newIp.trim()) return;
                    addWhitelistMutation.mutate({ data: { ip: newIp.trim(), notes: newIpNotes || undefined } });
                  }}
                  disabled={!newIp.trim() || addWhitelistMutation.isPending}
                  className="bg-green-700 hover:bg-green-800"
                >
                  {addWhitelistMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Plus className="h-4 w-4 mr-1.5" />}
                  Autorizar IP
                </Button>
              </div>
            </CardContent>
          </Card>

          <Button size="sm" variant="ghost" onClick={() => whitelistQuery.refetch()} className="ml-auto flex">
            <RefreshCw className={`h-4 w-4 mr-1.5 ${whitelistQuery.isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>

          {whitelistQuery.isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
          ) : whitelist.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-slate-400">
                <ShieldCheck className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                Nenhum IP autorizado manualmente ainda.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                        <th className="text-left px-4 py-3">IP</th>
                        <th className="text-left px-4 py-3">País</th>
                        <th className="text-left px-4 py-3">Autorizado por</th>
                        <th className="text-left px-4 py-3">Data</th>
                        <th className="text-left px-4 py-3">Observação</th>
                        <th className="text-right px-4 py-3">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {whitelist.map(entry => (
                        <tr key={entry.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-mono font-medium text-slate-800">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="gap-1 border-green-300 text-green-700 bg-green-50">
                                <ShieldCheck className="h-3 w-3" />Autorizado
                              </Badge>
                              {entry.ip}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <CountryFlag code={entry.countryCode} />
                              <span className="text-slate-600">{entry.country ?? "—"}</span>
                              {entry.city && <span className="text-slate-400 text-xs">({entry.city})</span>}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-600 text-xs">{entry.addedByName ?? "—"}</td>
                          <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                            {new Date(entry.addedAt).toLocaleString("pt-BR")}
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-xs">{entry.notes ?? <span className="text-slate-300">—</span>}</td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-600 hover:bg-red-50 h-7 px-2"
                              onClick={() => {
                                if (confirm(`Remover autorização do IP ${entry.ip}?\n\nEle voltará a ser bloqueado normalmente após erros de login.`))
                                  removeWhitelistMutation.mutate({ ip: entry.ip });
                              }}
                              disabled={removeWhitelistMutation.isPending}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
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
                        <th className="text-right px-4 py-3">Ações</th>
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
                            <div className="flex gap-1 justify-end">
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-blue-600 hover:bg-blue-50"
                                onClick={() => {
                                  if (confirm(`Autorizar permanentemente o IP ${log.ip}?\n\nEle nunca será bloqueado novamente.`))
                                    allowMutation.mutate({ ip: log.ip });
                                }}
                                disabled={allowMutation.isPending}
                                title="Autorizar permanentemente"
                              >
                                <ShieldPlus className="h-3.5 w-3.5" />
                              </Button>
                              {!log.success && (
                                <Button size="sm" variant="ghost" className="h-7 px-2 text-red-600 hover:bg-red-50"
                                  onClick={() => { if (confirm(`Banir permanentemente o IP ${log.ip}?`)) banMutation.mutate({ ip: log.ip }); }}
                                  disabled={banMutation.isPending}>
                                  <Ban className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
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
