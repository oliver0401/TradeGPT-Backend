import mongoose, { Schema, type Document, type Types } from "mongoose";
import type { TradeModeId } from "../utils/tradeModes.js";

export interface IConversation extends Document {
  userId: Types.ObjectId;
  title: string;
  mode: TradeModeId;
  createdAt: Date;
  updatedAt: Date;
}

const conversationSchema = new Schema<IConversation>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, default: "New chat" },
    mode: { type: String, required: true },
  },
  { timestamps: true }
);

conversationSchema.index({ userId: 1, updatedAt: -1 });

export const Conversation = mongoose.model<IConversation>(
  "Conversation",
  conversationSchema
);
