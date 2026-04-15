import type { IUser, PlanId } from "../models/User.js";

export type SubscriptionStatus = {
  plan: PlanId;
  label: string;
  trialActive: boolean;
  trialDaysLeft: number;
  trialEndsAt: string;
  accountCreatedAt: string;
};

export function getSubscriptionStatus(user: IUser): SubscriptionStatus {
  const now = new Date();
  const trialEnd = new Date(user.trialEndsAt);
  const trialActive = user.plan === "free" && trialEnd > now;
  const trialDaysLeft = trialActive
    ? Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))
    : 0;

  let label: string;
  if (user.plan === "pro") {
    label = "Pro Plan";
  } else if (trialActive) {
    label = `Free Trial — ${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left`;
  } else {
    label = "Free Plan";
  }

  return {
    plan: user.plan,
    label,
    trialActive,
    trialDaysLeft,
    trialEndsAt: user.trialEndsAt.toISOString(),
    accountCreatedAt: user.createdAt.toISOString(),
  };
}
