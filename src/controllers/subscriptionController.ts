import type { Request, Response } from "express";
import { User } from "../models/User.js";
import { getSubscriptionStatus } from "../utils/subscription.js";

export async function getMySubscription(req: Request, res: Response): Promise<void> {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const status = getSubscriptionStatus(user);
    res.json({ subscription: status });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch subscription" });
  }
}
