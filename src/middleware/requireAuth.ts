import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

/**
 * Accepts tokens signed by either system:
 * - Main site format: { uuid: "..." }
 * - Legacy TradeGPT format: { sub: "..." }
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    res.status(500).json({ error: "Server misconfiguration" });
    return;
  }

  try {
    const decoded = jwt.verify(token, secret) as { uuid?: string; sub?: string };
    const userId = decoded.uuid || decoded.sub;
    if (!userId) {
      res.status(401).json({ error: "Invalid token" });
      return;
    }
    req.userId = userId;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
