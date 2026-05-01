import type { Request, Response } from "express";
import { AppDataSource } from "../setup";
import { UserEntity } from "../entities/user.entity";
import { getSubscriptionStatus } from "../utils/subscription";

const userRepo = () => AppDataSource.getRepository(UserEntity);

export async function getMySubscription(req: Request, res: Response): Promise<void> {
  try {
    const user = await userRepo().findOne({ where: { uuid: req.userId! } });
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
