import express from "express";
import cors from "cors";
import { authRouter } from "./routes/authRoutes.js";
import { chatRouter } from "./routes/chatRoutes.js";
import { subscriptionRouter } from "./routes/subscriptionRoutes.js";
import { paymentRouter } from "./routes/paymentRoutes.js";
import { userRouter } from "./routes/userRoutes.js";

export function createApp() {
  const app = express();
  app.use(
    cors({
      origin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
      credentials: true,
    })
  );
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
