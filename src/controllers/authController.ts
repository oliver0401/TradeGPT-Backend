import crypto from "node:crypto";
import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { AppDataSource } from "../setup";
import { UserEntity, PaymentMethod, AuthProvider } from "../entities/user.entity";
import { PendingUserEntity } from "../entities/pendingUser.entity";
import {
  evaluatePasswordStrength,
  meetsMinimumPassword,
} from "../utils/passwordStrength";
import { sendVerificationEmail } from "../utils/mailer";
import { getSubscriptionStatus } from "../utils/subscription";
import { Env } from "../env";

const SALT_ROUNDS = 12;
const CODE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const TRIAL_DAYS = 7;

const userRepo = () => AppDataSource.getRepository(UserEntity);
const pendingUserRepo = () => AppDataSource.getRepository(PendingUserEntity);

/**
 * Signs a JWT with the same payload format as the main site backend
 * (payload: { uuid }) so tokens are interchangeable between services.
 */
function signToken(userId: string): string {
  const secret = Env.secretKey;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return jwt.sign({ uuid: userId }, secret);
}

function generateCode(): string {
  return String(crypto.randomInt(100_000, 1_000_000));
}

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

    const existing = await userRepo().findOne({ where: { email } });
    if (existing) {
      res
        .status(409)
        .json({ error: "An account with this email already exists" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const code = generateCode();

    await pendingUserRepo().delete({ email });
    await pendingUserRepo().save(
      pendingUserRepo().create({
        email,
        passwordHash,
        code,
        expiresAt: new Date(Date.now() + CODE_EXPIRY_MS),
      })
    );

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

export async function verifyEmail(req: Request, res: Response): Promise<void> {
  try {
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const code = String(req.body?.code ?? "").trim();

    if (!email || !code) {
      res.status(400).json({ error: "Email and code are required" });
      return;
    }

    const pending = await pendingUserRepo().findOne({ where: { email, code } });
    if (!pending) {
      res.status(400).json({ error: "Invalid or expired verification code" });
      return;
    }

    if (pending.expiresAt < new Date()) {
      await pendingUserRepo().delete({ email });
      res.status(400).json({ error: "Verification code has expired" });
      return;
    }

    const existingUser = await userRepo().findOne({ where: { email } });
    if (existingUser) {
      await pendingUserRepo().delete({ email });
      res
        .status(409)
        .json({ error: "An account with this email already exists" });
      return;
    }

    const trialExpiresAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    const user = await userRepo().save(
      userRepo().create({
        email: pending.email,
        passwordHash: pending.passwordHash,
        paymentMethod: PaymentMethod.FREE,
        authProvider: AuthProvider.EMAIL,
        trialExpiresAt,
        emailVerified: true,
      })
    );

    await pendingUserRepo().delete({ email });

    const token = signToken(user.uuid);
    const subscription = getSubscriptionStatus(user);
    res.status(201).json({
      token,
      user: { uuid: user.uuid, email: user.email },
      subscription,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Verification failed" });
  }
}

export async function resendCode(req: Request, res: Response): Promise<void> {
  try {
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    if (!email) {
      res.status(400).json({ error: "Email is required" });
      return;
    }

    const pending = await pendingUserRepo().findOne({ where: { email } });
    if (!pending) {
      res
        .status(404)
        .json({ error: "No pending registration found for this email" });
      return;
    }

    const code = generateCode();
    pending.code = code;
    pending.expiresAt = new Date(Date.now() + CODE_EXPIRY_MS);
    await pendingUserRepo().save(pending);

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

    const user = await userRepo().findOne({ where: { email } });
    if (!user) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const ok = await bcrypt.compare(password, user.passwordHash!);
    if (!ok) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const token = signToken(user.uuid);
    const subscription = getSubscriptionStatus(user);
    res.json({
      token,
      user: { uuid: user.uuid, email: user.email, fullName: user.fullName, avatar: user.avatar },
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

    const user = await userRepo().findOne({ where: { uuid: userId } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const currentMatches = await bcrypt.compare(currentPassword, user.passwordHash!);
    if (!currentMatches) {
      res.status(401).json({ error: "Current password is incorrect" });
      return;
    }

    const sameAsCurrent = await bcrypt.compare(newPassword, user.passwordHash!);
    if (sameAsCurrent) {
      res.status(400).json({ error: "New password must be different from current password" });
      return;
    }

    user.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await userRepo().save(user);
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

/**
 * Google SSO via ID token (verified client-side token).
 * Compatible with the main site's /auth/google endpoint.
 */
export async function googleLogin(req: Request, res: Response): Promise<void> {
  try {
    const idToken = String(req.body?.idToken ?? "").trim();
    if (!idToken) {
      res.status(400).json({ error: "Google ID token is required" });
      return;
    }
    if (!Env.googleClientId) {
      res.status(500).json({ error: "Google Client ID is not configured" });
      return;
    }

    const client = new OAuth2Client();
    const ticket = await client.verifyIdToken({
      idToken,
      audience: Env.googleClientId,
    });
    const payload = ticket.getPayload();
    const email = payload?.email?.trim().toLowerCase();
    if (!email) {
      res.status(401).json({ error: "Google account has no email" });
      return;
    }
    if (!payload?.email_verified) {
      res.status(401).json({ error: "Google account email is not verified" });
      return;
    }

    const fullName =
      (payload?.name ?? "").trim() ||
      [payload?.given_name, payload?.family_name].filter(Boolean).join(" ").trim();
    const avatar = (payload?.picture ?? "").trim() || undefined;

    const result = await findOrCreateGoogleUser(email, fullName, avatar);
    const token = signToken(result.uuid);
    const subscription = getSubscriptionStatus(result);

    res.json({
      token,
      user: { uuid: result.uuid, email: result.email, fullName: result.fullName, avatar: result.avatar },
      subscription,
    });
  } catch (e) {
    console.error("Google login error:", e);
    res.status(500).json({ error: "Google sign-in failed" });
  }
}

/**
 * Google SSO via authorization code (server-side exchange).
 * Compatible with the main site's /auth/google/code endpoint.
 */
export async function googleCodeLogin(req: Request, res: Response): Promise<void> {
  try {
    const code = String(req.body?.code ?? "").trim();
    if (!code) {
      res.status(400).json({ error: "Google authorization code is required" });
      return;
    }
    if (!Env.googleClientId || !Env.googleClientSecret) {
      res.status(500).json({ error: "Google OAuth is not configured" });
      return;
    }

    const client = new OAuth2Client({
      clientId: Env.googleClientId,
      clientSecret: Env.googleClientSecret,
    });

    const { tokens } = await client.getToken({
      code,
      redirect_uri: "postmessage",
    });

    const idToken = tokens.id_token;
    if (!idToken) {
      res.status(400).json({ error: "Google token exchange did not return an id_token" });
      return;
    }

    const ticket = await client.verifyIdToken({
      idToken,
      audience: Env.googleClientId,
    });
    const payload = ticket.getPayload();
    const email = payload?.email?.trim().toLowerCase();
    if (!email) {
      res.status(401).json({ error: "Google account has no email" });
      return;
    }
    if (!payload?.email_verified) {
      res.status(401).json({ error: "Google account email is not verified" });
      return;
    }

    const fullName =
      (payload?.name ?? "").trim() ||
      [payload?.given_name, payload?.family_name].filter(Boolean).join(" ").trim();
    const avatar = (payload?.picture ?? "").trim() || undefined;

    const result = await findOrCreateGoogleUser(email, fullName, avatar);
    const token = signToken(result.uuid);
    const subscription = getSubscriptionStatus(result);

    res.json({
      token,
      user: { uuid: result.uuid, email: result.email, fullName: result.fullName, avatar: result.avatar },
      subscription,
    });
  } catch (e) {
    console.error("Google code login error:", e);
    res.status(500).json({ error: "Google sign-in failed" });
  }
}

/**
 * Returns the current user from a valid Bearer token.
 * Used by frontends to validate a cross-domain SSO cookie token.
 */
export async function me(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const user = await userRepo().findOne({ where: { uuid: userId } });
    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }
    const subscription = getSubscriptionStatus(user);
    res.json({
      user: { uuid: user.uuid, email: user.email, fullName: user.fullName, avatar: user.avatar },
      subscription,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch user" });
  }
}

async function findOrCreateGoogleUser(
  email: string,
  fullName?: string,
  avatar?: string,
): Promise<UserEntity> {
  const existing = await userRepo().findOne({ where: { email } });
  if (existing) {
    let changed = false;
    if (!existing.avatar && avatar) { existing.avatar = avatar; changed = true; }
    if (!existing.fullName && fullName) { existing.fullName = fullName; changed = true; }
    if (changed) await userRepo().save(existing);
    return existing;
  }

  const trialExpiresAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  const user = await userRepo().save(
    userRepo().create({
      email,
      fullName,
      avatar,
      authProvider: AuthProvider.GOOGLE,
      paymentMethod: PaymentMethod.FREE,
      trialExpiresAt,
      emailVerified: true,
    }),
  );
  return user;
}
