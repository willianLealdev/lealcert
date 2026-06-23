import { Router } from "express";
import { or, eq } from "drizzle-orm";
import { db, ordersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import type { Request, Response, NextFunction } from "express";
import path from "path";
import fs from "fs";

const router = Router();

const UPLOAD_BASE = path.resolve(process.cwd(), "uploads");

function isSafeFile(base: string, file: string): boolean {
  return file.startsWith(base + path.sep) || file.startsWith(base + "/");
}

// Middleware: agentes e admins podem acessar estas rotas
function requireAgenteOrAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Não autenticado." });
    return;
  }
  const role = String(req.session.role ?? "");
  const isAgente = role === "agente";
  const isAdmin = role === "admin" || String(req.session.userType ?? "") === "admin";
  if (!isAgente && !isAdmin) {
    res.status(403).json({ error: "Acesso negado. Apenas agentes de registro." });
    return;
  }
  next();
}

// GET /agente/documentos/:protocolo
// Retorna APENAS nome do cliente/empresa + documentos vinculados ao protocolo
router.get("/agente/documentos/:protocolo", requireAuth, requireAgenteOrAdmin, async (req, res): Promise<void> => {
  const protocolo = String(req.params.protocolo ?? "").trim();
  if (!protocolo) {
    res.status(400).json({ error: "Protocolo obrigatório." });
    return;
  }

  const rows = await db.select({
    id: ordersTable.id,
    clientType: ordersTable.clientType,
    customerName: ordersTable.customerName,
    companyName: ordersTable.companyName,
    protocolNumber: ordersTable.protocolNumber,
    garProtocolo: ordersTable.garProtocolo,
    cnhPath: ordersTable.cnhPath,
    cartaoCnpjPath: ordersTable.cartaoCnpjPath,
    fichaCadastralPath: ordersTable.fichaCadastralPath,
    chatDocuments: ordersTable.chatDocuments,
  }).from(ordersTable).where(
    or(
      eq(ordersTable.protocolNumber, protocolo),
      eq(ordersTable.garProtocolo, protocolo),
    )
  ).limit(1);

  if (rows.length === 0) {
    res.status(404).json({ error: "Protocolo não encontrado." });
    return;
  }

  const o = rows[0];

  // Display name: company for e-CNPJ, personal name for e-CPF
  const displayName = o.clientType === "cnpj" && o.companyName
    ? o.companyName
    : o.customerName;

  // Build document list
  type DocItem = { label: string; key: string; url: string };
  const docs: DocItem[] = [];

  if (o.cnhPath) {
    const filename = path.basename(o.cnhPath);
    docs.push({ label: "CNH / RG do Titular", key: o.cnhPath, url: `/api/agente/download/cnh/${filename}` });
  }
  if (o.cartaoCnpjPath) {
    const filename = path.basename(o.cartaoCnpjPath);
    docs.push({ label: "Cartão CNPJ", key: o.cartaoCnpjPath, url: `/api/agente/download/cartao-cnpj/${filename}` });
  }
  if (o.fichaCadastralPath) {
    const filename = path.basename(o.fichaCadastralPath);
    docs.push({ label: "Ficha Cadastral", key: o.fichaCadastralPath, url: `/api/agente/download/ficha-cadastral/${filename}` });
  }

  // chatDocuments is a JSON array of {key, url, name, mimetype}
  if (o.chatDocuments) {
    try {
      const chatDocs = JSON.parse(o.chatDocuments) as Array<{ key?: string; url?: string; name?: string }>;
      for (const d of chatDocs) {
        if (d.key) {
          const filename = path.basename(d.key);
          docs.push({
            label: d.name ?? filename,
            key: d.key,
            url: `/api/agente/download/chat-docs/${filename}`,
          });
        }
      }
    } catch {
      // ignore invalid JSON
    }
  }

  res.json({
    protocolo,
    displayName,
    clientType: o.clientType,
    documents: docs,
  });
});

// GET /agente/download/:tipo/:filename — serve file for agente (authenticated)
const VALID_TIPOS = ["cnh", "cartao-cnpj", "ficha-cadastral", "chat-docs"];

router.get("/agente/download/:tipo/:filename", requireAuth, requireAgenteOrAdmin, (req, res): void => {
  const tipo = Array.isArray(req.params.tipo) ? req.params.tipo[0] : req.params.tipo;
  const raw = Array.isArray(req.params.filename) ? req.params.filename[0] : req.params.filename;
  const filename = path.basename(raw);

  if (!VALID_TIPOS.includes(tipo)) {
    res.status(400).json({ error: "Tipo inválido." });
    return;
  }

  const uploadDir = path.join(UPLOAD_BASE, tipo);
  const filePath = path.join(uploadDir, filename);

  if (!isSafeFile(uploadDir, filePath) || !fs.existsSync(filePath)) {
    res.status(404).json({ error: "Arquivo não encontrado." });
    return;
  }

  res.download(filePath, filename);
});

export default router;
