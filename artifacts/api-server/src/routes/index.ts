import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import certificatesRouter from "./certificates";
import ordersRouter from "./orders";
import slotsRouter from "./slots";
import supportRouter from "./support";
import settingsRouter from "./settings";
import dashboardRouter from "./dashboard";
import uploadRouter from "./upload";
import marketingRouter from "./marketing";
import chatRouter from "./chat";
import gestaoarRouter from "./gestaoar";
import mpWebhookRouter from "./mp-webhook";

const router: IRouter = Router();

router.use(healthRouter);
router.use(mpWebhookRouter);
router.use(chatRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(certificatesRouter);
router.use(ordersRouter);
router.use(gestaoarRouter);
router.use(slotsRouter);
router.use(supportRouter);
router.use(settingsRouter);
router.use(dashboardRouter);
router.use(uploadRouter);
router.use(marketingRouter);

export default router;
