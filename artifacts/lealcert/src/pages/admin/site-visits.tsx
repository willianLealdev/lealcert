import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

const apiFetch = (url: string) => fetch(`/api${url}`, { credentials: "include" }).then(r => r.json());
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Monitor, Smartphone, Tablet, Globe, Users, Eye, TrendingUp, RefreshCw, MapPin, Wifi, X,
} from "lucide-react";

type Period = "1d" | "7d" | "30d";

interface Stats {
  overview: { total_visits: string; unique_ips: string; unique_sessions: string; logged_users: string };
  topPages: { path: string; page_title: string; visits: string; uniques: string }[];
  byDevice: { device: string; visits: string }[];
  byCountry: { country: string; country_code: string; visits: string }[];
  byDay: { day: string; visits: string; uniques: string }[];
}

interface Visit {
  id: number;
  path: string;
  page_title: string;
  ip: string;
  country: string;
  country_code: string;
  city: string;
  region: string;
  isp: string;
  device: string;
  user_agent: string;
  referrer: string;
  session_id: string;
  created_at: string;
  user_name?: string;
  user_email?: string;
}

function DeviceIcon({ device }: { device: string }) {
  if (device === "mobile") return <Smartphone className="h-3 w-3" />;
  if (device === "tablet") return <Tablet className="h-3 w-3" />;
  return <Monitor className="h-3 w-3" />;
}

function flagEmoji(code: string) {
  if (!code || code.length !== 2) return "🌐";
  return String.fromCodePoint(...[...code.toUpperCase()].map(c => 0x1F1E0 + c.charCodeAt(0) - 65));
}

function relTime(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `${m}min atrás`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

// Barra horizontal simples
function BarRow({ label, value, max, sub, selected, onClick }: {
  label: string; value: number; max: number; sub?: string; selected?: boolean; onClick?: () => void;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div
      className={`space-y-1 rounded-lg p-1.5 -mx-1.5 transition-colors ${onClick ? "cursor-pointer hover:bg-muted/50" : ""} ${selected ? "bg-primary/10 ring-1 ring-primary/30" : ""}`}
      onClick={onClick}
    >
      <div className="flex justify-between text-xs">
        <span className="font-medium truncate max-w-[60%]">{label}</span>
        <span className="text-muted-foreground">{value.toLocaleString("pt-BR")}{sub ? ` (${sub})` : ""}</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${selected ? "bg-primary" : "bg-primary/60"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {selected && (
        <Badge variant="outline" className="text-[10px] mt-0.5">Filtrando ✓</Badge>
      )}
    </div>
  );
}

export default function AdminSiteVisits() {
  const [period, setPeriod] = useState<Period>("7d");
  const [selectedPath, setSelectedPath] = useState<string>("");
  const [selectedCountry, setSelectedCountry] = useState<string>("");
  const [page, setPage] = useState(1);

  // Stats sempre com filtro de país aplicado (exceto byCountry que vem completo para o seletor)
  const statsUrl = `/admin/site-visits/stats?period=${period}${selectedCountry ? `&country=${encodeURIComponent(selectedCountry)}` : ""}`;
  const recentUrl = `/admin/site-visits/recent?period=${period}&page=${page}${selectedPath ? `&path=${encodeURIComponent(selectedPath)}` : ""}${selectedCountry ? `&country=${encodeURIComponent(selectedCountry)}` : ""}`;

  const { data: stats, isLoading: loadingStats, refetch: refetchStats } = useQuery<Stats>({
    queryKey: ["site-visits-stats", period, selectedCountry],
    queryFn: () => apiFetch(statsUrl),
    refetchInterval: 60_000,
  });

  const { data: recent, isLoading: loadingRecent, refetch: refetchRecent } = useQuery<{ visits: Visit[]; total: number; page: number; limit: number }>({
    queryKey: ["site-visits-recent", period, selectedPath, selectedCountry, page],
    queryFn: () => apiFetch(recentUrl),
    refetchInterval: 60_000,
  });

  const totalVisits    = parseInt(stats?.overview?.total_visits    ?? "0", 10);
  const uniqueIps      = parseInt(stats?.overview?.unique_ips      ?? "0", 10);
  const uniqueSessions = parseInt(stats?.overview?.unique_sessions ?? "0", 10);
  const loggedUsers    = parseInt(stats?.overview?.logged_users    ?? "0", 10);
  const maxPageVisits    = Math.max(...(stats?.topPages?.map(p => parseInt(p.visits, 10))   ?? [1]));
  const maxCountryVisits = Math.max(...(stats?.byCountry?.map(c => parseInt(c.visits, 10)) ?? [1]));

  const periodLabel = period === "1d" ? "hoje" : period === "7d" ? "últimos 7 dias" : "últimos 30 dias";
  const totalPages  = Math.ceil((recent?.total ?? 0) / (recent?.limit ?? 50));

  const hasFilter = !!selectedPath || !!selectedCountry;

  function clearAllFilters() {
    setSelectedPath("");
    setSelectedCountry("");
    setPage(1);
  }

  function toggleCountry(code: string) {
    setSelectedCountry(prev => prev === code ? "" : code);
    setPage(1);
  }

  function togglePath(path: string) {
    setSelectedPath(prev => prev === path ? "" : path);
    setPage(1);
  }

  // País selecionado para mostrar label
  const selectedCountryData = stats?.byCountry?.find(c => c.country_code === selectedCountry);

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Visitas ao Site</h1>
          <p className="text-sm text-muted-foreground">Acompanhe em tempo real onde seus clientes estão navegando</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Seletor de país */}
          <Select
            value={selectedCountry || "__all__"}
            onValueChange={v => { setSelectedCountry(v === "__all__" ? "" : v); setPage(1); }}
          >
            <SelectTrigger className="w-44">
              <MapPin className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
              <SelectValue placeholder="Todos os países" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">🌐 Todos os países</SelectItem>
              {stats?.byCountry?.map(c => (
                <SelectItem key={c.country_code} value={c.country_code}>
                  {flagEmoji(c.country_code)} {c.country ?? "Desconhecido"} ({parseInt(c.visits, 10).toLocaleString("pt-BR")})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Período */}
          <Select value={period} onValueChange={v => { setPeriod(v as Period); setPage(1); }}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1d">Hoje</SelectItem>
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="30d">Últimos 30 dias</SelectItem>
            </SelectContent>
          </Select>

          {hasFilter && (
            <Button variant="outline" size="sm" onClick={clearAllFilters} className="gap-1.5 text-muted-foreground">
              <X className="h-3.5 w-3.5" /> Limpar filtros
            </Button>
          )}

          <Button variant="outline" size="icon" onClick={() => { refetchStats(); refetchRecent(); }}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Banner de filtro ativo */}
      {hasFilter && (
        <div className="flex items-center gap-2 p-3 bg-primary/5 border border-primary/20 rounded-xl text-sm flex-wrap">
          <span className="text-muted-foreground">Filtrando por:</span>
          {selectedCountry && (
            <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => { setSelectedCountry(""); setPage(1); }}>
              {flagEmoji(selectedCountry)} {selectedCountryData?.country ?? selectedCountry}
              <X className="h-3 w-3" />
            </Badge>
          )}
          {selectedPath && (
            <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => { setSelectedPath(""); setPage(1); }}>
              📄 {selectedPath}
              <X className="h-3 w-3" />
            </Badge>
          )}
        </div>
      )}

      {/* Cards resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Eye className="h-4 w-4" /><span className="text-xs">Total de Visitas</span>
            </div>
            <p className="text-2xl font-bold">{totalVisits.toLocaleString("pt-BR")}</p>
            <p className="text-xs text-muted-foreground">{periodLabel}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Globe className="h-4 w-4" /><span className="text-xs">IPs Únicos</span>
            </div>
            <p className="text-2xl font-bold">{uniqueIps.toLocaleString("pt-BR")}</p>
            <p className="text-xs text-muted-foreground">visitantes distintos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <TrendingUp className="h-4 w-4" /><span className="text-xs">Sessões Únicas</span>
            </div>
            <p className="text-2xl font-bold">{uniqueSessions.toLocaleString("pt-BR")}</p>
            <p className="text-xs text-muted-foreground">navegações distintas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Users className="h-4 w-4" /><span className="text-xs">Usuários Logados</span>
            </div>
            <p className="text-2xl font-bold">{loggedUsers.toLocaleString("pt-BR")}</p>
            <p className="text-xs text-muted-foreground">clientes identificados</p>
          </CardContent>
        </Card>
      </div>

      {/* Top páginas + Por país + Por dispositivo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Top páginas */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Páginas mais visitadas</CardTitle>
            <CardDescription>Clique em uma página para filtrar as visitas recentes</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {loadingStats && <p className="text-sm text-muted-foreground">Carregando...</p>}
            {stats?.topPages?.map(p => (
              <BarRow
                key={p.path}
                label={p.page_title || p.path}
                value={parseInt(p.visits, 10)}
                max={maxPageVisits}
                sub={`${p.uniques} únicos`}
                selected={selectedPath === p.path}
                onClick={() => togglePath(p.path)}
              />
            ))}
            {!loadingStats && !stats?.topPages?.length && (
              <p className="text-sm text-muted-foreground">Nenhuma visita registrada no período.</p>
            )}
          </CardContent>
        </Card>

        {/* Por país + dispositivo */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-4 w-4" />Por País
                <span className="text-xs font-normal text-muted-foreground ml-auto">Clique para filtrar</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {stats?.byCountry?.map(c => (
                <div
                  key={c.country_code}
                  className={`flex items-center justify-between text-sm rounded-lg px-2 py-1.5 cursor-pointer transition-colors ${
                    selectedCountry === c.country_code
                      ? "bg-primary/10 ring-1 ring-primary/30"
                      : "hover:bg-muted/50"
                  }`}
                  onClick={() => toggleCountry(c.country_code)}
                >
                  <span className="flex items-center gap-1.5">
                    {flagEmoji(c.country_code)}
                    <span className="truncate max-w-[120px]">{c.country ?? "Desconhecido"}</span>
                    {selectedCountry === c.country_code && <Badge variant="outline" className="text-[9px] px-1 py-0">✓</Badge>}
                  </span>
                  <span className="font-medium text-xs shrink-0">{parseInt(c.visits, 10).toLocaleString("pt-BR")}</span>
                </div>
              ))}
              {!loadingStats && !stats?.byCountry?.length && (
                <p className="text-xs text-muted-foreground">Nenhum dado de localização.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Monitor className="h-4 w-4" />Por Dispositivo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {stats?.byDevice?.map(d => (
                <div key={d.device} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 capitalize">
                    <DeviceIcon device={d.device} />
                    {d.device === "mobile" ? "Celular" : d.device === "tablet" ? "Tablet" : "Computador"}
                  </span>
                  <span className="font-medium">{parseInt(d.visits, 10).toLocaleString("pt-BR")}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Visitas recentes */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Visitas Recentes</CardTitle>
              <CardDescription>
                {recent?.total?.toLocaleString("pt-BR") ?? 0} visitas encontradas
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Página</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Localização</TableHead>
                  <TableHead>Provedor</TableHead>
                  <TableHead>Dispositivo</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Quando</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingRecent && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Carregando...</TableCell></TableRow>
                )}
                {recent?.visits?.map(v => (
                  <TableRow key={v.id} className="text-xs">
                    <TableCell className="font-medium max-w-[160px]">
                      <span className="truncate block" title={v.path}>{v.page_title || v.path}</span>
                      <span className="text-muted-foreground text-[10px]">{v.path}</span>
                    </TableCell>
                    <TableCell>
                      <code className="text-[11px] bg-muted px-1 py-0.5 rounded">{v.ip || "—"}</code>
                    </TableCell>
                    <TableCell>
                      {v.country ? (
                        <button
                          className="flex items-center gap-1 text-left hover:underline"
                          onClick={() => toggleCountry(v.country_code)}
                          title="Filtrar por este país"
                        >
                          {flagEmoji(v.country_code)} {v.city ? `${v.city}, ` : ""}{v.country}
                        </button>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground truncate max-w-[120px] block" title={v.isp ?? ""}>{v.isp || "—"}</span>
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1 capitalize">
                        <DeviceIcon device={v.device} />
                        {v.device === "mobile" ? "Celular" : v.device === "tablet" ? "Tablet" : "PC"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {v.user_name ? (
                        <div>
                          <span className="font-medium">{v.user_name}</span>
                          <br /><span className="text-muted-foreground text-[10px]">{v.user_email}</span>
                        </div>
                      ) : <span className="text-muted-foreground">Anônimo</span>}
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">{relTime(v.created_at)}</TableCell>
                  </TableRow>
                ))}
                {!loadingRecent && !recent?.visits?.length && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhuma visita registrada no período.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Paginação */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-xs text-muted-foreground">Página {page} de {totalPages}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Próxima</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
