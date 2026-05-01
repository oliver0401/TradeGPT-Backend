import express from "express";
import cors from "cors";
import { authRouter } from "./routes/authRoutes";
import { chatRouter } from "./routes/chatRoutes";
import { subscriptionRouter } from "./routes/subscriptionRoutes";
import { paymentRouter } from "./routes/paymentRoutes";
import { userRouter } from "./routes/userRoutes";

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/chat", chatRouter);
  app.use("/api/subscription", subscriptionRouter);
  app.use("/api/payment", paymentRouter);
  app.use("/api/user", userRouter);

  return app;
}
