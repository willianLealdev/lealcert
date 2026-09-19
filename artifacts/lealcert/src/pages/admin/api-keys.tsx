import { useEffect, useState } from "react";
import {
  KeyRound, Plus, Copy, RotateCw, Ban, ShieldCheck, Clock, Activity, Loader2, Check,
  Pencil, Trash2, ScrollText,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type AccessLevel = "read" | "write" | "full";
type ApiKey = {
  id: number;
  name: string;
  tokenPrefix: string;
  accessLevel: AccessLevel;
  scopes: string[];
  telephonyCapabilities: string[];
  aiWebhookUrl: string | null;
  aiWebhookKey: string | null;
  hasAiWebhookSecret: boolean;
  allowedIps: string[];
  rateLimitPerMinute: number;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  isActive: boolean;
  createdAt: string;
};

type ApiKeyAuditLog = {
  id: number;
  method: string;
  path: string;
  scope: string | null;
  statusCode: number;
  durationMs: number;
  createdAt: string;
};

const SCOPE_LABELS: Record<string, string> = {
  users: "Clientes e contadores", orders: "Pedidos", certificates: "Certificados",
  slots: "Agenda", support: "Suporte", dashboard: "Dashboard",
  marketing: "Marketing por e-mail", whatsapp: "Marketing por WhatsApp",
  discagem: "Ligações e discagem IA", renewals: "Renovações", coupons: "Cupons",
  agents: "Agentes", nfse: "Notas fiscais", loyalty: "Fidelidade",
  vendors: "Vendedores", meetings: "Reuniões", operators: "Operadores",
  referrals: "Indicações", finance: "Relatório financeiro",
};
const ALL_SCOPES = Object.keys(SCOPE_LABELS);
const TELEPHONY_OPTIONS = [
  { value: "analyze", label: "Nível 1 — Analisar ligações", description: "Lê chamadas, transcrições, resultados, prompts e ações registradas." },
  { value: "brain", label: "Nível 2 — Cérebro comercial", description: "Recebe cada turno por webhook e devolve a próxima fala. A IA atual assume em caso de falha." },
  { value: "command", label: "Nível 3 — Comandar ações", description: "Inicia e pausa ligações, atualiza interesse, agenda retorno, envia WhatsApp, cria resumo e tarefa humana." },
];
const LEVEL_LABELS: Record<AccessLevel, string> = {
  read: "Leitura", write: "Escrita", full: "Total",
};

async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "include",
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const responseText = await response.text();
  let data: Record<string, any> = {};
  try {
    data = responseText ? JSON.parse(responseText) : {};
  } catch {
    data = {};
  }
  if (!response.ok) {
    const detail = data.error || responseText.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
    throw new Error(detail || `O servidor respondeu HTTP ${response.status} sem detalhes.`);
  }
  return data as T;
}

function fmt(value: string | null): string {
  return value ? new Date(value).toLocaleString("pt-BR") : "Nunca";
}

function toDatetimeLocal(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export default function AdminApiKeys() {
  const { toast } = useToast();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [revealedToken, setRevealedToken] = useState("");
  const [tokenTitle, setTokenTitle] = useState("");
  const [name, setName] = useState("");
  const [level, setLevel] = useState<AccessLevel>("full");
  const [scopes, setScopes] = useState<string[]>(ALL_SCOPES);
  const [expires, setExpires] = useState("");
  const [allowedIps, setAllowedIps] = useState("");
  const [rateLimit, setRateLimit] = useState("60");
  const [telephonyCapabilities, setTelephonyCapabilities] = useState<string[]>([]);
  const [aiWebhookUrl, setAiWebhookUrl] = useState("");
  const [aiWebhookKey, setAiWebhookKey] = useState("");
  const [aiWebhookSecret, setAiWebhookSecret] = useState("");
  const [editingKey, setEditingKey] = useState<ApiKey | null>(null);
  const [testingKeyId, setTestingKeyId] = useState<number | null>(null);
  const [logKey, setLogKey] = useState<ApiKey | null>(null);
  const [hermesLogs, setHermesLogs] = useState<ApiKeyAuditLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const load = async () => {
    try {
      setKeys(await apiRequest<ApiKey[]>("/api/admin/api-keys"));
    } catch (error) {
      toast({ title: "Erro ao carregar chaves", description: (error as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const resetForm = () => {
    setName(""); setLevel("full"); setScopes(ALL_SCOPES); setExpires("");
    setAllowedIps(""); setRateLimit("60"); setEditingKey(null);
    setTelephonyCapabilities([]); setAiWebhookUrl(""); setAiWebhookKey(""); setAiWebhookSecret("");
  };

  const openCreate = () => {
    resetForm();
    setFormOpen(true);
  };

  const openEdit = (key: ApiKey) => {
    setEditingKey(key);
    setName(key.name);
    setLevel(key.accessLevel);
    setScopes([...key.scopes]);
    setExpires(toDatetimeLocal(key.expiresAt));
    setAllowedIps(key.allowedIps.join(", "));
    setRateLimit(String(key.rateLimitPerMinute));
    setTelephonyCapabilities([...(key.telephonyCapabilities ?? [])]);
    setAiWebhookUrl(key.aiWebhookUrl ?? "");
    setAiWebhookKey(key.aiWebhookKey ?? "");
    setAiWebhookSecret("");
    setFormOpen(true);
  };

  const saveKey = async () => {
    setSaving(true);
    try {
      const payload = {
        name, accessLevel: level, scopes,
        telephonyCapabilities: scopes.includes("discagem") ? telephonyCapabilities : [],
        aiWebhookUrl: telephonyCapabilities.includes("brain") ? aiWebhookUrl.trim() : null,
        aiWebhookKey: telephonyCapabilities.includes("brain") ? aiWebhookKey.trim() : null,
        aiWebhookSecret: telephonyCapabilities.includes("brain") && aiWebhookSecret ? aiWebhookSecret : undefined,
        expiresAt: expires ? new Date(expires).toISOString() : null,
        allowedIps: allowedIps.split(/[\n,]/).map(v => v.trim()).filter(Boolean),
        rateLimitPerMinute: Number(rateLimit),
      };
      if (editingKey) {
        await apiRequest<ApiKey>(`/api/admin/api-keys/${editingKey.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        setFormOpen(false);
        toast({ title: "Chave atualizada", description: "O token existente não foi alterado." });
      } else {
        const created = await apiRequest<ApiKey & { token: string }>("/api/admin/api-keys", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setFormOpen(false);
        setRevealedToken(created.token);
        setTokenTitle(`Chave criada: ${created.name}`);
      }
      resetForm();
      await load();
    } catch (error) {
      toast({ title: editingKey ? "Erro ao editar chave" : "Erro ao criar chave", description: (error as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const deleteKey = async (key: ApiKey) => {
    if (!window.confirm(`Excluir definitivamente a chave "${key.name}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await apiRequest(`/api/admin/api-keys/${key.id}`, {
        method: "DELETE",
        body: JSON.stringify({
          confirmation: true,
        }),
      });
      toast({ title: "Chave excluída", description: "O token não pode mais ser utilizado." });
      await load();
    } catch (error) {
      toast({ title: "Erro ao excluir chave", description: (error as Error).message, variant: "destructive" });
    }
  };

  const revoke = async (key: ApiKey) => {
    if (!window.confirm(`Revogar a chave "${key.name}"? O acesso será interrompido imediatamente.`)) return;
    try {
      await apiRequest(`/api/admin/api-keys/${key.id}/revoke`, { method: "POST" });
      toast({ title: "Chave revogada" });
      await load();
    } catch (error) {
      toast({ title: "Erro ao revogar", description: (error as Error).message, variant: "destructive" });
    }
  };

  const rotate = async (key: ApiKey) => {
    if (!window.confirm(`Rotacionar a chave "${key.name}"? O token atual deixará de funcionar imediatamente.`)) return;
    try {
      const updated = await apiRequest<ApiKey & { token: string }>(`/api/admin/api-keys/${key.id}/rotate`, { method: "POST" });
      setRevealedToken(updated.token);
      setTokenTitle(`Nova chave: ${key.name}`);
      await load();
    } catch (error) {
      toast({ title: "Erro ao rotacionar", description: (error as Error).message, variant: "destructive" });
    }
  };

  const testHermes = async (key: ApiKey) => {
    setTestingKeyId(key.id);
    try {
      const result = await apiRequest<{ ok: boolean; latencyMs: number; message: string }>(`/api/admin/api-keys/${key.id}/test-hermes`, { method: "POST" });
      toast({ title: "Hermes conectado", description: `${result.message} Tempo: ${result.latencyMs} ms.` });
    } catch (error) {
      toast({ title: "Falha na conexão com o Hermes", description: (error as Error).message, variant: "destructive" });
    } finally {
      setTestingKeyId(null);
      if (logKey?.id === key.id) void openHermesLogs(key);
    }
  };

  const openHermesLogs = async (key: ApiKey) => {
    setLogKey(key);
    setLoadingLogs(true);
    try {
      const rows = await apiRequest<ApiKeyAuditLog[]>(`/api/admin/api-keys/${key.id}/audit`);
      setHermesLogs(rows.filter(row => row.scope?.startsWith("hermes-diagnostic:") || row.scope?.startsWith("hermes-call:")));
    } catch (error) {
      toast({ title: "Erro ao carregar logs do Hermes", description: (error as Error).message, variant: "destructive" });
    } finally {
      setLoadingLogs(false);
    }
  };

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast({ title: "Copiado para a área de transferência" });
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <KeyRound className="h-6 w-6 text-blue-600" /> Chaves de API REST
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Acesso controlado para o Hermes e outras integrações servidor a servidor.
          </p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Nova chave</Button>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-5 flex gap-3"><ShieldCheck className="text-emerald-600" /><div><p className="font-semibold">Token protegido</p><p className="text-sm text-slate-500">O segredo é exibido uma única vez e salvo somente como hash.</p></div></CardContent></Card>
        <Card><CardContent className="pt-5 flex gap-3"><Activity className="text-blue-600" /><div><p className="font-semibold">Acesso auditado</p><p className="text-sm text-slate-500">Método, endpoint, status, duração e IP são registrados.</p></div></CardContent></Card>
        <Card><CardContent className="pt-5 flex gap-3"><Clock className="text-amber-600" /><div><p className="font-semibold">Controle imediato</p><p className="text-sm text-slate-500">Expiração, revogação, rotação e limite por minuto.</p></div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">Chaves cadastradas</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>
          ) : keys.length === 0 ? (
            <div className="py-12 text-center text-slate-500">Nenhuma chave criada.</div>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Nome / prefixo</TableHead><TableHead>Nível</TableHead>
                <TableHead>Módulos / telefonia</TableHead><TableHead>Expiração</TableHead>
                <TableHead>Último uso</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead>
              </TableRow></TableHeader>
              <TableBody>{keys.map(key => {
                const expired = !!key.expiresAt && new Date(key.expiresAt) <= new Date();
                const active = key.isActive && !key.revokedAt && !expired;
                return <TableRow key={key.id}>
                  <TableCell><p className="font-medium">{key.name}</p><code className="text-xs text-slate-500">{key.tokenPrefix}...</code></TableCell>
                  <TableCell><Badge variant="outline">{LEVEL_LABELS[key.accessLevel]}</Badge></TableCell>
                  <TableCell><span className="text-sm">{key.scopes.length} módulos</span>{key.telephonyCapabilities?.length > 0 && <p className="text-xs text-blue-600">{key.telephonyCapabilities.length} níveis de telefonia</p>}</TableCell>
                  <TableCell className="text-xs">{fmt(key.expiresAt)}</TableCell>
                  <TableCell className="text-xs">{key.lastUsedAt ? fmt(key.lastUsedAt) : "Ainda não usada"}</TableCell>
                  <TableCell><Badge variant={active ? "default" : "secondary"}>{active ? "Ativa" : expired ? "Expirada" : "Revogada"}</Badge></TableCell>
                  <TableCell className="text-right space-x-1">
                    {active && key.scopes.includes("discagem") && key.telephonyCapabilities?.includes("brain") && key.aiWebhookUrl && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => testHermes(key)} disabled={testingKeyId === key.id} title="Testar conexão com o Hermes">
                          {testingKeyId === key.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openHermesLogs(key)} title="Ver logs de conexão do Hermes">
                          <ScrollText className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    <Button size="sm" variant="outline" onClick={() => openEdit(key)} title="Editar"><Pencil className="h-4 w-4" /></Button>
                    {active && <>
                      <Button size="sm" variant="outline" onClick={() => rotate(key)} title="Rotacionar"><RotateCw className="h-4 w-4" /></Button>
                      <Button size="sm" variant="destructive" onClick={() => revoke(key)} title="Revogar"><Ban className="h-4 w-4" /></Button>
                    </>}
                    <Button size="sm" variant="destructive" onClick={() => deleteKey(key)} title="Excluir"><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>;
              })}</TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!logKey} onOpenChange={open => { if (!open) { setLogKey(null); setHermesLogs([]); } }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Logs de conexão — {logKey?.name}</DialogTitle>
            <DialogDescription>Histórico persistente dos testes manuais e das ligações reais executadas por este servidor. Nenhum token ou assinatura é armazenado.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto border rounded-lg">
            {loadingLogs ? (
              <div className="py-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>
            ) : hermesLogs.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-500">Nenhum teste registrado. Clique no botão de atividade para testar a conexão.</div>
            ) : (
              <div className="divide-y">
                {hermesLogs.map(log => {
                  const success = log.statusCode >= 200 && log.statusCode < 300;
                  const isCall = log.scope?.startsWith("hermes-call:");
                  const callMatch = isCall ? log.scope?.match(/^hermes-call:([^:]+):(?:(opening|qualification|pitch|objection|closing|follow_up):)?(.*)$/) : null;
                  const callId = callMatch?.[1];
                  const stage = callMatch?.[2];
                  const message = isCall
                    ? callMatch?.[3] || "Sem detalhes."
                    : log.scope?.replace(/^hermes-diagnostic:/, "") || "Sem detalhes.";
                  return (
                    <div key={log.id} className="p-4 space-y-2">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                          <Badge variant={success ? "default" : "destructive"}>{success ? "Conectado" : "Erro"}</Badge>
                          <Badge variant="outline">{isCall ? `Ligação #${callId}` : "Teste manual"}</Badge>
                          {stage && <Badge variant="secondary">{stage}</Badge>}
                          <span className="text-sm font-medium">HTTP {log.statusCode}</span>
                          <span className="text-xs text-slate-500">{log.durationMs} ms</span>
                        </div>
                        <span className="text-xs text-slate-500">{fmt(log.createdAt)}</span>
                      </div>
                      <p className="text-sm break-words">{message}</p>
                      <p className="text-xs text-slate-400 break-all">{log.path}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <DialogFooter>
            {logKey && <Button variant="outline" onClick={() => openHermesLogs(logKey)} disabled={loadingLogs}>Atualizar</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader><CardTitle className="text-lg">Como usar</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>Base da API: <code className="bg-slate-100 px-2 py-1 rounded">/api/external/v1</code></p>
          <pre className="bg-slate-950 text-slate-100 rounded-lg p-4 overflow-x-auto text-xs">{`curl -H "Authorization: Bearer SUA_CHAVE" \\
  https://seu-dominio.com/api/external/v1/users`}</pre>
          <p className="text-slate-500">Os caminhos depois de <code>/v1</code> são os mesmos endpoints REST do módulo autorizado. SQL direto, autenticação, webhooks e gerenciamento de chaves não são expostos.</p>
        </CardContent>
      </Card>

      <Dialog open={formOpen} onOpenChange={open => { setFormOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingKey ? "Editar chave de API" : "Nova chave de API"}</DialogTitle>
            <DialogDescription>{editingKey ? `Altere as permissões e configurações de ${editingKey.name}. O token não será modificado.` : "Todos os módulos começam selecionados. Ajuste somente se quiser restringir a integração."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Nome da integração</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: Hermes produção" /></div>
              <div className="space-y-2"><Label>Nível de acesso</Label>
                <Select value={level} onValueChange={v => setLevel(v as AccessLevel)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                  <SelectItem value="read">Leitura — GET e HEAD</SelectItem>
                  <SelectItem value="write">Escrita — leitura + POST, PUT e PATCH</SelectItem>
                  <SelectItem value="full">Total — inclui DELETE</SelectItem>
                </SelectContent></Select>
              </div>
              <div className="space-y-2"><Label>Expira em (opcional)</Label><Input type="datetime-local" value={expires} onChange={e => setExpires(e.target.value)} /><p className="text-xs text-slate-500">Em branco: duração indeterminada.</p></div>
              <div className="space-y-2"><Label>Limite por minuto</Label><Input type="number" min={1} max={10000} value={rateLimit} onChange={e => setRateLimit(e.target.value)} /></div>
            </div>
            <div className="space-y-2"><Label>IPs permitidos (opcional)</Label><Input value={allowedIps} onChange={e => setAllowedIps(e.target.value)} placeholder="203.0.113.10, 203.0.113.11" /><p className="text-xs text-slate-500">Separe por vírgula. Em branco permite qualquer IP.</p></div>
            <div className="space-y-3">
              <div className="flex items-center justify-between"><Label>Módulos permitidos</Label><Button type="button" variant="ghost" size="sm" onClick={() => setScopes(scopes.length === ALL_SCOPES.length ? [] : ALL_SCOPES)}>{scopes.length === ALL_SCOPES.length ? "Desmarcar todos" : "Marcar todos"}</Button></div>
              <div className="grid sm:grid-cols-2 gap-2 border rounded-lg p-3">
                {ALL_SCOPES.map(scope => <label key={scope} className="flex items-center gap-2 text-sm py-1 cursor-pointer"><Checkbox checked={scopes.includes(scope)} onCheckedChange={checked => setScopes(checked ? [...scopes, scope] : scopes.filter(v => v !== scope))} />{SCOPE_LABELS[scope]}</label>)}
              </div>
            </div>
            {scopes.includes("discagem") && <div className="space-y-3">
              <div>
                <Label>Permissões de telefonia</Label>
                <p className="text-xs text-slate-500 mt-1">Independentes do nível HTTP geral da chave.</p>
              </div>
              <div className="space-y-2 border rounded-lg p-3">
                {TELEPHONY_OPTIONS.map(option => <label key={option.value} className="flex items-start gap-3 text-sm py-1 cursor-pointer">
                  <Checkbox className="mt-0.5" checked={telephonyCapabilities.includes(option.value)} onCheckedChange={checked => setTelephonyCapabilities(checked ? [...telephonyCapabilities, option.value] : telephonyCapabilities.filter(v => v !== option.value))} />
                  <span><span className="font-medium block">{option.label}</span><span className="text-xs text-slate-500">{option.description}</span></span>
                </label>)}
              </div>
              {telephonyCapabilities.includes("brain") && <div className="space-y-2">
                <Label>Webhook HTTPS do Hermes</Label>
                <Input type="url" value={aiWebhookUrl} onChange={e => setAiWebhookUrl(e.target.value)} placeholder="https://hermes.exemplo.com/lealcert/turn" />
                <Label>Webhook Key do Hermes</Label>
                <Input value={aiWebhookKey} onChange={e => setAiWebhookKey(e.target.value)} placeholder="Valor de LEALCERT_WEBHOOK_KEY no Hermes" autoComplete="off" />
                <Label>Webhook Secret do Hermes</Label>
                <Input type="password" value={aiWebhookSecret} onChange={e => setAiWebhookSecret(e.target.value)} placeholder={editingKey?.hasAiWebhookSecret ? "Deixe vazio para manter o secret atual" : "Valor de LEALCERT_WEBHOOK_SECRET no Hermes"} autoComplete="new-password" />
                <p className="text-xs text-slate-500">Timeout de 4,5 segundos. Se o webhook falhar, a IA configurada no LealCert responde automaticamente.</p>
              </div>}
            </div>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button><Button onClick={saveKey} disabled={saving || !name.trim() || scopes.length === 0 || (telephonyCapabilities.includes("brain") && (!aiWebhookUrl.trim() || !aiWebhookKey.trim() || (!aiWebhookSecret && !editingKey?.hasAiWebhookSecret)))}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{editingKey ? "Salvar alterações" : "Gerar chave"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!revealedToken} onOpenChange={open => { if (!open) setRevealedToken(""); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{tokenTitle}</DialogTitle><DialogDescription>Copie agora. Por segurança, o token completo não poderá ser consultado novamente.</DialogDescription></DialogHeader>
          <Alert><Check className="h-4 w-4" /><AlertTitle>Chave pronta para uso</AlertTitle><AlertDescription><code className="block mt-2 p-3 bg-slate-100 rounded break-all select-all">{revealedToken}</code></AlertDescription></Alert>
          <DialogFooter><Button onClick={() => copy(revealedToken)}><Copy className="h-4 w-4 mr-2" />Copiar chave</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}