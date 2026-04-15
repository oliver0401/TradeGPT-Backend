import type { Request, Response } from "express";
import { User } from "../models/User.js";

export async function getNotificationPrefs(req: Request, res: Response): Promise<void> {
  try {
    const user = await User.findById(req.userId).select("notifications");
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({
      notifications: {
        productUpdates: user.notifications?.productUpdates ?? false,
        marketing: user.notifications?.marketing ?? false,
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

    const update: Record<string, boolean> = {};
    if (typeof productUpdates === "boolean") update["notifications.productUpdates"] = productUpdates;
    if (typeof marketing === "boolean") update["notifications.marketing"] = marketing;

    if (Object.keys(update).length === 0) {
      res.status(400).json({ error: "No valid fields to update" });
      return;
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      { $set: update },
      { new: true, select: "notifications" },
    );

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({
      notifications: {
        productUpdates: user.notifications?.productUpdates ?? false,
        marketing: user.notifications?.marketing ?? false,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to update notification preferences" });
  }
}
