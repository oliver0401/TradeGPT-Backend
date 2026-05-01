import { Router } from "express";
import { getMySubscription } from "../controllers/subscriptionController";
import { requireAuth } from "../middleware/requireAuth";

export const subscriptionRouter = Router();

subscriptionRouter.use(requireAuth);
subscriptionRouter.get("/me", getMySubscription);
