import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Search, FileDown, FileText, User } from "lucide-react";
type AgentDocumentResult = { protocolo: string; displayName: string; clientType: string; documents: { label: string; key: string; url: string }[] };

const apiFetch = (url: string, init?: RequestInit) =>
  fetch(url, { credentials: "include", ...init });

function DocIcon({ name }: { name: string }) {
  const lower = name.toLowerCase();
  if (lower.includes("cnh") || lower.includes("rg")) return <FileText className="h-4 w-4 text-blue-500" />;
  if (lower.includes("cnpj")) return <FileText className="h-4 w-4 text-purple-500" />;
  if (lower.includes("ficha")) return <FileText className="h-4 w-4 text-green-500" />;
  return <FileText className="h-4 w-4 text-muted-foreground" />;
}

export default function AgenteConsultar() {
  const [protocolo, setProtocolo] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AgentDocumentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const p = protocolo.trim();
    if (!p) return;

    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const res = await apiFetch(`/api/agente/documentos/${encodeURIComponent(p)}`);
      if (res.status === 404) {
        setError("Protocolo não encontrado. Verifique o número e tente novamente.");
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Erro desconhecido" }));
        setError(body.error ?? "Erro ao consultar protocolo.");
        return;
      }
      const data: AgentDocumentResult = await res.json();
      setResult(data);
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDownload(url: string, label: string, key: string) {
    setDownloadingKey(key);
    try {
      const res = await apiFetch(url);
      if (!res.ok) {
        alert("Arquivo não encontrado.");
        return;
      }
      const blob = await res.blob();
      const contentDisposition = res.headers.get("Content-Disposition");
      let filename = label.replace(/[^a-zA-Z0-9._-]/g, "_");
      if (contentDisposition) {
        const match = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(contentDisposition);
        if (match?.[1]) filename = match[1].replace(/['"]/g, "");
      }
      const objUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(objUrl);
    } catch {
      alert("Erro ao baixar arquivo.");
    } finally {
      setDownloadingKey(null);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Consultar Documentos</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Informe o número do protocolo para acessar os documentos do cliente.
        </p>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <Input
          value={protocolo}
          onChange={e => { setProtocolo(e.target.value); setError(null); setResult(null); }}
          placeholder="Número do protocolo..."
          className="flex-1 h-11"
          disabled={loading}
        />
        <Button type="submit" disabled={loading || !protocolo.trim()} className="h-11 px-5 gap-1.5">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Buscar
        </Button>
      </form>

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 text-destructive rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {result && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              {result.displayName}
            </CardTitle>
            <p className="text-sm text-muted-foreground">Protocolo: <span className="font-medium text-foreground">{result.protocolo}</span></p>
          </CardHeader>
          <CardContent>
            {result.documents.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Nenhum documento disponível para este protocolo.</p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  Documentos disponíveis ({result.documents.length})
                </p>
                {result.documents.map((doc: { label: string; key: string; url: string }) => (
                  <div
                    key={doc.key}
                    className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <DocIcon name={doc.label} />
                      <span className="text-sm font-medium truncate">{doc.label}</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 gap-1.5 h-8"
                      disabled={downloadingKey === doc.key}
                      onClick={() => handleDownload(doc.url, doc.label, doc.key)}
                    >
                      {downloadingKey === doc.key
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <FileDown className="h-3.5 w-3.5" />
                      }
                      Baixar
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
