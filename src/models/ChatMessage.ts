import mongoose, { Schema, type Document, type Types } from "mongoose";
import type { TradeModeId } from "../utils/tradeModes.js";

export type ChatRole = "user" | "assistant" | "system";

export interface IChatMessage extends Document {
  conversationId: Types.ObjectId;
  role: ChatRole;
  content: string;
  /** Trading mode active when the user sent this message (user messages only). */
  tradeMode?: TradeModeId;
  suggestedQuestions?: string[];
  createdAt: Date;
}

const chatMessageSchema = new Schema<IChatMessage>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    role: { type: String, enum: ["user", "assistant", "system"], required: true },
    content: { type: String, required: true },
    tradeMode: { type: String, required: false },
    suggestedQuestions: { type: [String], default: undefined },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

chatMessageSchema.index({ conversationId: 1, createdAt: 1 });

export const ChatMessage = mongoose.model<IChatMessage>(
  "ChatMessage",
  chatMessageSchema
);
