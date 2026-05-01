import type { Request, Response } from "express";
import { AppDataSource } from "../setup";
import { UserEntity } from "../entities/user.entity";

const userRepo = () => AppDataSource.getRepository(UserEntity);

export async function getNotificationPrefs(req: Request, res: Response): Promise<void> {
  try {
    const user = await userRepo().findOne({ where: { uuid: req.userId! } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({
      notifications: {
        productUpdates: false,
        marketing: false,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch notification preferences" });
  }
}

export async function updateNotificationPrefs(req: Request, res: Response): Promise<void> {
  try {
    const { productUpdates, marketing } = req.body ?? {};

    if (typeof productUpdates !== "boolean" && typeof marketing !== "boolean") {
      res.status(400).json({ error: "No valid fields to update" });
      return;
    }

    const user = await userRepo().findOne({ where: { uuid: req.userId! } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({
      notifications: {
        productUpdates: typeof productUpdates === "boolean" ? productUpdates : false,
        marketing: typeof marketing === "boolean" ? marketing : false,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to update notification preferences" });
  }
}
