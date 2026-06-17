import { Router } from "express";
import { requireAuth } from "../middlewares/auth";

const router = Router();

interface BrasilApiCnpj {
  razao_social?: string;
  nome_fantasia?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
  email?: string;
  ddd_telefone_1?: string;
  descricao_situacao_cadastral?: string;
  [key: string]: unknown;
}

router.get("/cnpj-lookup", requireAuth, async (req, res): Promise<void> => {
  const cnpj = String(req.query.cnpj ?? "").replace(/\D/g, "");
  if (!cnpj || cnpj.length !== 14) {
    res.status(400).json({ error: "CNPJ inválido — deve ter 14 dígitos." });
    return;
  }
  try {
    const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
      headers: { "Accept": "application/json", "User-Agent": "LealCert/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      res.status(resp.status === 404 ? 404 : 502).json({ error: text || "CNPJ não encontrado na Receita Federal." });
      return;
    }
    const data = await resp.json() as BrasilApiCnpj;
    res.json({
      razaoSocial: data.razao_social ?? "",
      nomeFantasia: data.nome_fantasia ?? "",
      logradouro: data.logradouro ?? "",
      numero: data.numero ?? "",
      complemento: data.complemento ?? "",
      bairro: data.bairro ?? "",
      municipio: data.municipio ?? "",
      uf: data.uf ?? "",
      cep: (data.cep ?? "").replace(/\D/g, ""),
      situacao: data.descricao_situacao_cadastral ?? "",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro ao consultar CNPJ.";
    req.log?.error({ err }, "cnpj-lookup error");
    res.status(502).json({ error: msg });
  }
});

export default router;
