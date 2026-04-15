import mongoose, { Schema, type Document } from "mongoose";

export interface IPendingUser extends Document {
  email: string;
  passwordHash: string;
  code: string;
  expiresAt: Date;
  createdAt: Date;
}

const pendingUserSchema = new Schema<IPendingUser>(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    code: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

pendingUserSchema.index({ email: 1 });
pendingUserSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PendingUser = mongoose.model<IPendingUser>(
  "PendingUser",
  pendingUserSchema
);
