import { Router } from "express";
import { getNotificationPrefs, updateNotificationPrefs } from "../controllers/userController.js";
import { requireAuth } from "../middleware/requireAuth.js";

export const userRouter = Router();

userRouter.use(requireAuth);
userRouter.get("/notifications", getNotificationPrefs);
userRouter.patch("/notifications", updateNotificationPrefs);
