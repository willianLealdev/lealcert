import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { requireAuth } from "../middlewares/auth";

const router = Router();

const CHAT_DOCS_DIR = path.resolve(process.cwd(), "uploads", "chat-docs");
if (!fs.existsSync(CHAT_DOCS_DIR)) fs.mkdirSync(CHAT_DOCS_DIR, { recursive: true });

/** Validate that a resolved file path is strictly inside the expected directory. */
function isSafeFile(dir: string, filePath: string): boolean {
  const resolved = path.resolve(filePath);
  const resolvedDir = path.resolve(dir);
  return resolved.startsWith(resolvedDir + path.sep);
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

const TIPOS = ["cnh", "cartao-cnpj", "ficha-cadastral"] as const;
type Tipo = (typeof TIPOS)[number];

function makeUploadDir(tipo: Tipo) {
  const dir = path.resolve(process.cwd(), "uploads", tipo);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function makeStorage(tipo: Tipo) {
  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, makeUploadDir(tipo)),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, "") || ".pdf";
      const name = `${tipo}_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
      cb(null, name);
    },
  });
}

const fileFilter = (_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowed = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
  cb(null, allowed.includes(file.mimetype));
};

for (const tipo of TIPOS) {
  const upload = multer({ storage: makeStorage(tipo), limits: { fileSize: 5 * 1024 * 1024 }, fileFilter });

  router.post(`/upload/${tipo}`, requireAuth, upload.single("file"), (req, res): void => {
    if (!req.file) {
      res.status(400).json({ error: "Arquivo inválido. Envie PDF, JPG ou PNG (máx 5MB)." });
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
