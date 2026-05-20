import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { requireAuth } from "../middlewares/auth";

const router = Router();

const CHAT_DOCS_DIR = path.join(process.cwd(), "uploads", "chat-docs");
if (!fs.existsSync(CHAT_DOCS_DIR)) fs.mkdirSync(CHAT_DOCS_DIR, { recursive: true });

router.get("/uploads/chat-docs/:filename", requireAuth, (req, res): void => {
  const filename = Array.isArray(req.params.filename) ? req.params.filename[0] : req.params.filename;
  const filePath = path.join(CHAT_DOCS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "Arquivo não encontrado." });
    return;
  }
  res.sendFile(filePath);
});

const TIPOS = ["cnh", "cartao-cnpj", "ficha-cadastral"] as const;
type Tipo = (typeof TIPOS)[number];

function makeUploadDir(tipo: Tipo) {
  const dir = path.join(process.cwd(), "uploads", tipo);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function makeStorage(tipo: Tipo) {
  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, makeUploadDir(tipo)),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || ".pdf";
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
    const filename = Array.isArray(req.params.filename) ? req.params.filename[0] : req.params.filename;
    const filePath = path.join(makeUploadDir(tipo), filename);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: "Arquivo não encontrado." });
      return;
    }
    res.sendFile(filePath);
  });
}

export default router;
