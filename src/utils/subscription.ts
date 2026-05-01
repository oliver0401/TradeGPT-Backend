import { UserEntity, PaymentMethod } from "../entities/user.entity";

export type SubscriptionStatus = {
  plan: string;
  label: string;
  trialActive: boolean;
  trialDaysLeft: number;
  trialEndsAt: string;
  accountCreatedAt: string;
};

export function getSubscriptionStatus(user: UserEntity): SubscriptionStatus {
  const now = new Date();
  const trialEnd = user.trialExpiresAt ? new Date(user.trialExpiresAt) : now;
  const trialActive = user.paymentMethod === PaymentMethod.FREE && trialEnd > now;
  const trialDaysLeft = trialActive
    ? Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))
    : 0;

  let label: string;
  if (user.paymentMethod === PaymentMethod.PRO) {
    label = "Pro Plan";
  } else if (trialActive) {
    label = `Free Trial — ${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left`;
  } else {
    label = "Free Plan";
  }

  return {
    plan: user.paymentMethod,
    label,
    trialActive,
    trialDaysLeft,
    trialEndsAt: trialEnd.toISOString(),
    accountCreatedAt: user.createdAt.toISOString(),
  };
}
