import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

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
    const decoded = jwt.verify(token, secret) as { sub?: string };
    if (!decoded.sub) {
      res.status(401).json({ error: "Invalid token" });
      return;
    }
    req.userId = decoded.sub;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
