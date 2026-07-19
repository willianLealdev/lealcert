import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

// Timestamp fixo do momento em que o servidor foi iniciado.
// Muda a cada deploy/restart — o frontend usa para detectar nova versão.
const SERVER_START_TIME = Date.now().toString();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/version", (_req, res) => {
  res.json({ v: SERVER_START_TIME });
});

export default router;
