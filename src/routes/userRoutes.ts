import { Router } from "express";
import { getNotificationPrefs, updateNotificationPrefs } from "../controllers/userController";
import { requireAuth } from "../middleware/requireAuth";

export const userRouter = Router();

userRouter.use(requireAuth);
userRouter.get("/notifications", getNotificationPrefs);
userRouter.patch("/notifications", updateNotificationPrefs);
