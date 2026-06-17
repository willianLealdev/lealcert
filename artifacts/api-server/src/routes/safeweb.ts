import { Router } from "express";
import { db, settingsTable } from "@workspace/db";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { logger } from "../lib/logger";
import {
  swListarProdutos,
  swConsultaCPF,
  swConsultaCNPJ,
  swLocaisPorCnpjAr,
  swLocaisPorIbge,
  swAdicionarSolicitacaoCPF,
  swAdicionarSolicitacaoCNPJ,
  swTestarAutenticacao,
  type SafewebSettings,
} from "../lib/safeweb";

const router = Router();

async function getSwSettings(): Promise<SafewebSettings | null> {
  const [s] = await db.select().from(settingsTable).limit(1);
  if (!s?.safewebUrl || !s?.safewebUsername || !s?.safewebPassword) return null;
  return {
    url: s.safewebUrl,
    username: s.safewebUsername,
    password: s.safewebPassword,
    cnpjAr: s.safewebCnpjAr ?? undefined,
  };
}

function requireSwSettings(
  settings: SafewebSettings | null,
  res: Parameters<Parameters<typeof router.get>[1]>[1],
): settings is SafewebSettings {
  if (!settings) {
    res.status(400).json({
      error: "Safeweb não configurada. Acesse Configurações → Safeweb para inserir URL, usuário e senha.",
    });
    return false;
  }
  return true;
}

// ── Testar autenticação ───────────────────────────────────────────────────────
router.post("/safeweb/test-auth", requireAdmin, async (req, res): Promise<void> => {
  const sw = await getSwSettings();
  if (!requireSwSettings(sw, res)) return;
  try {
    const result = await swTestarAutenticacao(sw);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "Safeweb test-auth error");
    res.status(502).json({ error: (err as Error).message });
  }
});

// ── Listar produtos ───────────────────────────────────────────────────────────
router.get("/safeweb/produtos", requireAuth, async (req, res): Promise<void> => {
  const sw = await getSwSettings();
  if (!requireSwSettings(sw, res)) return;
  const { idTipoEmissao, cnpjAr } = req.query as Record<string, string>;
  try {
    const result = await swListarProdutos(sw, Number(idTipoEmissao ?? 1), cnpjAr);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "Safeweb ListarProdutos error");
    res.status(502).json({ error: "Erro ao listar produtos na Safeweb." });
  }
});

// ── Consulta prévia CPF ───────────────────────────────────────────────────────
router.post("/safeweb/consulta-cpf", requireAuth, async (req, res): Promise<void> => {
  const sw = await getSwSettings();
  if (!requireSwSettings(sw, res)) return;
  const { cpf, dataNascimento } = req.body ?? {};
  if (!cpf || !dataNascimento) {
    res.status(400).json({ error: "CPF e dataNascimento são obrigatórios." });
    return;
  }
  try {
    const result = await swConsultaCPF(sw, cpf, dataNascimento);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "Safeweb ConsultaCPF error");
    res.status(502).json({ error: "Erro ao consultar CPF na Safeweb." });
  }
});

// ── Consulta prévia CNPJ ──────────────────────────────────────────────────────
router.post("/safeweb/consulta-cnpj", requireAuth, async (req, res): Promise<void> => {
  const sw = await getSwSettings();
  if (!requireSwSettings(sw, res)) return;
  const { cnpj, cpfResponsavel, dataNascimento } = req.body ?? {};
  if (!cnpj || !cpfResponsavel || !dataNascimento) {
    res.status(400).json({ error: "CNPJ, CPF do responsável e dataNascimento são obrigatórios." });
    return;
  }
  try {
    const result = await swConsultaCNPJ(sw, cnpj, cpfResponsavel, dataNascimento);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "Safeweb ConsultaCNPJ error");
    res.status(502).json({ error: "Erro ao consultar CNPJ na Safeweb." });
  }
});

// ── Locais de atendimento por CNPJ AR ─────────────────────────────────────────
router.get("/safeweb/locais", requireAuth, async (req, res): Promise<void> => {
  const sw = await getSwSettings();
  if (!requireSwSettings(sw, res)) return;
  const { cnpjAr, idStatus } = req.query as Record<string, string>;
  try {
    const result = await swLocaisPorCnpjAr(sw, cnpjAr, idStatus ? Number(idStatus) : undefined);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "Safeweb LocaisPorCnpjAr error");
    res.status(502).json({ error: "Erro ao consultar locais na Safeweb." });
  }
});

// ── Locais de atendimento por código IBGE ─────────────────────────────────────
router.post("/safeweb/locais/ibge", requireAuth, async (req, res): Promise<void> => {
  const sw = await getSwSettings();
  if (!requireSwSettings(sw, res)) return;
  const { codigoIbge } = req.body ?? {};
  if (!codigoIbge) {
    res.status(400).json({ error: "codigoIbge é obrigatório." });
    return;
  }
  try {
    const result = await swLocaisPorIbge(sw, codigoIbge);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "Safeweb LocaisPorIbge error");
    res.status(502).json({ error: "Erro ao consultar locais por IBGE na Safeweb." });
  }
});

// ── Adicionar solicitação (CPF — pessoa física) ───────────────────────────────
router.post("/safeweb/solicitacao/cpf", requireAuth, async (req, res): Promise<void> => {
  const sw = await getSwSettings();
  if (!requireSwSettings(sw, res)) return;
  const body = req.body ?? {};
  if (!body.CnpjAR) body.CnpjAR = sw.cnpjAr ?? "";
  if (!body.Nome || !body.CPF || !body.idProduto) {
    res.status(400).json({ error: "Nome, CPF e idProduto são obrigatórios." });
    return;
  }
  try {
    const result = await swAdicionarSolicitacaoCPF(sw, body);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "Safeweb AdicionarSolicitacaoCPF error");
    res.status(502).json({ error: "Erro ao adicionar solicitação CPF na Safeweb." });
  }
});

// ── Adicionar solicitação (CNPJ — pessoa jurídica) ────────────────────────────
router.post("/safeweb/solicitacao/cnpj", requireAuth, async (req, res): Promise<void> => {
  const sw = await getSwSettings();
  if (!requireSwSettings(sw, res)) return;
  const body = req.body ?? {};
  if (!body.CnpjAR) body.CnpjAR = sw.cnpjAr ?? "";
  if (!body.CNPJ || !body.Nome || !body.CPF || !body.idProduto) {
    res.status(400).json({ error: "CNPJ, Nome, CPF e idProduto são obrigatórios." });
    return;
  }
  try {
    const result = await swAdicionarSolicitacaoCNPJ(sw, body);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "Safeweb AdicionarSolicitacaoCNPJ error");
    res.status(502).json({ error: "Erro ao adicionar solicitação CNPJ na Safeweb." });
  }
});

export default router;
