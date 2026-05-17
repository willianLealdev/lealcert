import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { requireAuth } from "../middlewares/auth";

const router = Router();

const uploadDir = path.join(process.cwd(), "uploads", "cnh");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".pdf";
    const name = `cnh_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
    cb(null, allowed.includes(file.mimetype));
  },
});

router.post("/upload/cnh", requireAuth, upload.single("file"), (req, res): void => {
  if (!req.file) {
    res.status(400).json({ error: "Arquivo inválido. Envie PDF, JPG ou PNG (máx 5MB)." });
    return;
  }
  const key = `uploads/cnh/${req.file.filename}`;
  res.json({ key, url: `/api/${key}` });
});

router.get("/uploads/cnh/:filename", requireAuth, (req, res): void => {
  const filename = Array.isArray(req.params.filename) ? req.params.filename[0] : req.params.filename;
  const filePath = path.join(uploadDir, filename);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "Arquivo não encontrado." });
    return;
  }
  res.sendFile(filePath);
});

export default router;
