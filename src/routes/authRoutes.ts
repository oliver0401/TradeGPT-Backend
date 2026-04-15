import { Router } from "express";
import {
  changePassword,
  login,
  passwordStrengthPreview,
  register,
  resendCode,
  verifyEmail,
} from "../controllers/authController.js";
import { requireAuth } from "../middleware/requireAuth.js";

export const authRouter = Router();

authRouter.post("/register", register);
authRouter.post("/verify-email", verifyEmail);
authRouter.post("/resend-code", resendCode);
authRouter.post("/login", login);
authRouter.post("/password-strength", passwordStrengthPreview);
authRouter.post("/change-password", requireAuth, changePassword);
