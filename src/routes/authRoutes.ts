import { Router } from "express";
import {
  changePassword,
  googleCodeLogin,
  googleLogin,
  login,
  me,
  passwordStrengthPreview,
  register,
  resendCode,
  verifyEmail,
} from "../controllers/authController";
import { requireAuth } from "../middleware/requireAuth";

export const authRouter = Router();

authRouter.post("/register", register);
authRouter.post("/verify-email", verifyEmail);
authRouter.post("/resend-code", resendCode);
authRouter.post("/login", login);
authRouter.post("/google", googleLogin);
authRouter.post("/google/code", googleCodeLogin);
authRouter.get("/me", requireAuth, me);
authRouter.post("/password-strength", passwordStrengthPreview);
authRouter.post("/change-password", requireAuth, changePassword);
