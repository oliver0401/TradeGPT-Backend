import mongoose, { Schema, type Document } from "mongoose";

export type PlanId = "free" | "pro";

export interface INotificationPrefs {
  productUpdates: boolean;
  marketing: boolean;
}

export interface IUser extends Document {
  email: string;
  passwordHash: string;
  plan: PlanId;
  trialEndsAt: Date;
  notifications: INotificationPrefs;
  createdAt: Date;
}

const TRIAL_DAYS = 7;

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true },
    plan: { type: String, enum: ["free", "pro"], default: "free" },
    notifications: {
      productUpdates: { type: Boolean, default: false },
      marketing: { type: Boolean, default: false },
    },
    trialEndsAt: {
      type: Date,
      default: () => new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
    },
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>("User", userSchema);

export { TRIAL_DAYS };
