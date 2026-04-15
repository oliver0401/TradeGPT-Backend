import { Router } from "express";
import { getMySubscription } from "../controllers/subscriptionController.js";
import { requireAuth } from "../middleware/requireAuth.js";

export const subscriptionRouter = Router();

subscriptionRouter.use(requireAuth);
subscriptionRouter.get("/me", getMySubscription);
