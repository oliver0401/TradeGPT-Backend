import { Router } from "express";
import {
  listNetworks,
  createCheckout,
  cancelPayment,
  paymentWebhook,
  getPaymentStatus,
  checkPaymentLogs,
} from "../controllers/paymentController.js";
import { requireAuth } from "../middleware/requireAuth.js";

export const paymentRouter = Router();

paymentRouter.get("/webhook", paymentWebhook);
paymentRouter.get("/networks", listNetworks);

paymentRouter.use(requireAuth);
paymentRouter.post("/create-checkout", createCheckout);
paymentRouter.post("/cancel/:id", cancelPayment);
paymentRouter.get("/status/:id", getPaymentStatus);
paymentRouter.get("/check-logs/:id", checkPaymentLogs);
