/**
 * Busca e cacheia o conteúdo das páginas principais do site LealCert.
 * O texto extraído é injetado no system prompt do agente como referência,
 * permitindo que o agente responda perguntas não cobertas pelo script fixo.
 *
 * Cache de 4h — não afeta latência das ligações pois é pré-carregado.
 */

const PAGES = [
  "https://lealcert.com.br",
  "https://lealcert.com.br/contadores",
];

const REFRESH_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 horas
const MAX_CHARS_PER_PAGE = 2000;

interface CacheEntry {
  url: string;
  text: string;
  fetchedAt: number;
}

let cache: CacheEntry[] = [];
let lastRefresh = 0;

/** Extrai texto legível de HTML — remove tags, scripts, estilos, links de menu */
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

async function fetchPage(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "LealCert-Agent/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return "";
    const html = await res.text();
    const text = stripHtml(html);
    return text.slice(0, MAX_CHARS_PER_PAGE);
  } catch {
    return "";
  }
}

export async function refreshSiteCache(): Promise<void> {
  const now = Date.now();
  if (now - lastRefresh < REFRESH_INTERVAL_MS && cache.length > 0) return;

  const entries = await Promise.all(
    PAGES.map(async url => ({
      url,
      text: await fetchPage(url),
      fetchedAt: Date.now(),
    }))
  );

  cache = entries.filter(e => e.text.length > 50);
  lastRefresh = now;

  if (cache.length > 0) {
    console.log("[site-cache] Conteúdo do site atualizado (%d páginas)", cache.length);
  }
}

/**
 * Retorna um bloco de texto pronto para injetar no system prompt.
 * Vazio se o site não estiver acessível.
 */
export function getSiteCacheBlock(): string {
  if (cache.length === 0) return "";
  const lines = cache.map(e => `[${e.url}]\n${e.text}`).join("\n\n---\n\n");
  return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONTEÚDO ATUAL DO SITE LEALCERT (referência)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Use estas informações para responder dúvidas que não estejam cobertas pelo script.
Nunca invente; se não encontrar a resposta aqui, passe o WhatsApp de suporte.

${lines}
`.trim();
}
