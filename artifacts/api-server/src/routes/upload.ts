import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

const UPLOAD_BASE = path.resolve(process.cwd(), "uploads");
// Pré-cria todos os diretórios de upload no startup para evitar falhas na primeira requisição
for (const dir of ["chat-docs", "cnh", "cartao-cnpj", "ficha-cadastral", "outros"]) {
  fs.mkdirSync(path.join(UPLOAD_BASE, dir), { recursive: true });
}
const CHAT_DOCS_DIR = path.join(UPLOAD_BASE, "chat-docs");

/** Validate that a resolved file path is strictly inside the expected directory. */
function isSafeFile(dir: string, filePath: string): boolean {
  const resolved = path.resolve(filePath);
  const resolvedDir = path.resolve(dir);
  return resolved.startsWith(resolvedDir + path.sep);
}

/**
 * Verify file magic bytes to prevent MIME-type spoofing.
 * Checks the actual binary content of the file, not the client-provided MIME type.
 */
function verifyMagicBytes(filePath: string): boolean {
  let fd: number | null = null;
  try {
    fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(8);
    fs.readSync(fd, buf, 0, 8, 0);

    // PDF: %PDF (25 50 44 46)
    if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return true;
    // JPEG: FF D8 FF
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
      buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
    ) return true;

    return false;
  } catch {
    return false;
  } finally {
    if (fd !== null) try { fs.closeSync(fd); } catch { /* ignore */ }
  }
}

router.get("/uploads/chat-docs/:filename", requireAuth, (req, res): void => {
  const raw = Array.isArray(req.params.filename) ? req.params.filename[0] : req.params.filename;
  const filename = path.basename(raw); // strip any ../.. traversal
  const filePath = path.join(CHAT_DOCS_DIR, filename);
  if (!isSafeFile(CHAT_DOCS_DIR, filePath) || !fs.existsSync(filePath)) {
    res.status(404).json({ error: "Arquivo não encontrado." });
    return;
  }
  res.sendFile(filePath);
});

const TIPOS = ["cnh", "cartao-cnpj", "ficha-cadastral", "outros"] as const;
type Tipo = (typeof TIPOS)[number];

function makeUploadDir(tipo: Tipo) {
  const dir = path.join(UPLOAD_BASE, tipo);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function makeStorage(tipo: Tipo) {
  return multer.diskStorage({
    destination: (_req, _file, cb) => {
      try { cb(null, makeUploadDir(tipo)); } catch (err) { cb(err as Error, ""); }
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, "") || ".pdf";
      const name = `${tipo}_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
      cb(null, name);
    },
  });
}

// First-pass MIME check (client-provided — defense-in-depth layer 1)
const fileFilter = (_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowed = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
  cb(null, allowed.includes(file.mimetype));
};

for (const tipo of TIPOS) {
  const upload = multer({ storage: makeStorage(tipo), limits: { fileSize: 5 * 1024 * 1024 }, fileFilter });

  router.post(`/upload/${tipo}`, requireAuth, (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err) {
        logger.warn({ err, tipo }, `upload/${tipo}: erro no multer`);
        res.status(400).json({ error: err.message ?? "Erro ao processar arquivo." });
        return;
      }
      next();
    });
  }, (req, res): void => {
    if (!req.file) {
      res.status(400).json({ error: "Arquivo inválido. Envie PDF, JPG ou PNG (máx 5MB)." });
      return;
    }

    // Second-pass: verify actual magic bytes (defense-in-depth layer 2)
    if (!verifyMagicBytes(req.file.path)) {
      logger.warn({ path: req.file.path, mimetype: req.file.mimetype }, "upload: magic bytes inválidos — removendo arquivo");
      try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
      res.status(400).json({ error: "Conteúdo do arquivo não corresponde ao tipo declarado." });
      return;
    }

    const key = `uploads/${tipo}/${req.file.filename}`;
    res.json({ key, url: `/api/${key}` });
  });

  router.get(`/uploads/${tipo}/:filename`, requireAuth, (req, res): void => {
    const uploadDir = makeUploadDir(tipo);
    const raw = Array.isArray(req.params.filename) ? req.params.filename[0] : req.params.filename;
    const filename = path.basename(raw);
    const filePath = path.join(uploadDir, filename);
    if (!isSafeFile(uploadDir, filePath) || !fs.existsSync(filePath)) {
      res.status(404).json({ error: "Arquivo não encontrado." });
      return;
    }
    res.sendFile(filePath);
  });
}

export default router;
