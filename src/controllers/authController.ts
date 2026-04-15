import crypto from "node:crypto";
import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User, TRIAL_DAYS } from "../models/User.js";
import { PendingUser } from "../models/PendingUser.js";
import {
  evaluatePasswordStrength,
  meetsMinimumPassword,
} from "../utils/passwordStrength.js";
import { sendVerificationEmail } from "../utils/mailer.js";
import { getSubscriptionStatus } from "../utils/subscription.js";

const SALT_ROUNDS = 12;
const CODE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

function signToken(userId: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return jwt.sign({ sub: userId }, secret, { expiresIn: "7d" });
}

function generateCode(): string {
  return String(crypto.randomInt(100_000, 1_000_000));
}

/**
 * Step 1 — validate input, hash password, send verification code.
 * Does NOT create the real User yet.
 */
export async function register(req: Request, res: Response): Promise<void> {
  try {
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const password = String(req.body?.password ?? "");
    const confirmPassword = String(req.body?.confirmPassword ?? "");

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: "Valid email is required" });
      return;
    }
    if (!password) {
      res.status(400).json({ error: "Password is required" });
      return;
    }
    if (password !== confirmPassword) {
      res.status(400).json({ error: "Passwords do not match" });
      return;
    }
    if (!meetsMinimumPassword(password)) {
      const strength = evaluatePasswordStrength(password);
      res.status(400).json({ error: "Password is too weak", strength });
      return;
    }

    const existing = await User.findOne({ email });
    if (existing) {
      res
        .status(409)
        .json({ error: "An account with this email already exists" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const code = generateCode();

    await PendingUser.deleteMany({ email });
    await PendingUser.create({
      email,
      passwordHash,
      code,
      expiresAt: new Date(Date.now() + CODE_EXPIRY_MS),
    });

    sendVerificationEmail(email, code).catch((err) =>
      console.error("Failed to send verification email:", err)
    );

    res.status(200).json({
      message: "Verification code sent",
      email,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Registration failed" });
  }
}

/**
 * Step 2 — verify the 6-digit code, create real User, return JWT.
 */
export async function verifyEmail(req: Request, res: Response): Promise<void> {
  try {
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const code = String(req.body?.code ?? "").trim();

    if (!email || !code) {
      res.status(400).json({ error: "Email and code are required" });
      return;
    }

    const pending = await PendingUser.findOne({ email, code });
    if (!pending) {
      res.status(400).json({ error: "Invalid or expired verification code" });
      return;
    }

    if (pending.expiresAt < new Date()) {
      await PendingUser.deleteMany({ email });
      res.status(400).json({ error: "Verification code has expired" });
      return;
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      await PendingUser.deleteMany({ email });
      res
        .status(409)
        .json({ error: "An account with this email already exists" });
      return;
    }

    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    const user = await User.create({
      email: pending.email,
      passwordHash: pending.passwordHash,
      plan: "free",
      trialEndsAt,
    });

    await PendingUser.deleteMany({ email });

    const token = signToken(user._id.toString());
    const subscription = getSubscriptionStatus(user);
    res.status(201).json({
      token,
      user: { id: user._id.toString(), email: user.email },
      subscription,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Verification failed" });
  }
}

/**
 * Resend a new verification code for the same pending registration.
 */
export async function resendCode(req: Request, res: Response): Promise<void> {
  try {
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    if (!email) {
      res.status(400).json({ error: "Email is required" });
      return;
    }

    const pending = await PendingUser.findOne({ email });
    if (!pending) {
      res
        .status(404)
        .json({ error: "No pending registration found for this email" });
      return;
    }

    const code = generateCode();
    pending.code = code;
    pending.expiresAt = new Date(Date.now() + CODE_EXPIRY_MS);
    await pending.save();

    sendVerificationEmail(email, code).catch((err) =>
      console.error("Failed to resend verification email:", err)
    );

    res.status(200).json({ message: "New verification code sent" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to resend code" });
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const password = String(req.body?.password ?? "");

    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    const user = await User.findOne({ email });
    if (!user) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const token = signToken(user._id.toString());
    const subscription = getSubscriptionStatus(user);
    res.json({
      token,
      user: { id: user._id.toString(), email: user.email },
      subscription,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Login failed" });
  }
}

export async function changePassword(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    const currentPassword = String(req.body?.currentPassword ?? "");
    const newPassword = String(req.body?.newPassword ?? "");
    const confirmPassword = String(req.body?.confirmPassword ?? "");

    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!currentPassword || !newPassword || !confirmPassword) {
      res.status(400).json({ error: "All password fields are required" });
      return;
    }
    if (newPassword !== confirmPassword) {
      res.status(400).json({ error: "New passwords do not match" });
      return;
    }
    if (!meetsMinimumPassword(newPassword)) {
      const strength = evaluatePasswordStrength(newPassword);
      res.status(400).json({ error: "Password is too weak", strength });
      return;
    }

    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const currentMatches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!currentMatches) {
      res.status(401).json({ error: "Current password is incorrect" });
      return;
    }

    const sameAsCurrent = await bcrypt.compare(newPassword, user.passwordHash);
    if (sameAsCurrent) {
      res.status(400).json({ error: "New password must be different from current password" });
      return;
    }

    user.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await user.save();
    res.json({ message: "Password changed successfully" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to change password" });
  }
}

export function passwordStrengthPreview(req: Request, res: Response): void {
  const password = String(req.body?.password ?? "");
  const strength = evaluatePasswordStrength(password);
  res.json({ strength });
}
