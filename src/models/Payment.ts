import mongoose, { Schema, type Document } from "mongoose";

export type PaymentStatus = "pending" | "confirming" | "confirmed" | "expired";
export type PaymentNetwork = "eth" | "bsc" | "tron" | "sol";
export type PaymentToken = "usdt" | "usdc";

export interface IPayment extends Document {
  userId: mongoose.Types.ObjectId;
  network: PaymentNetwork;
  token: PaymentToken;
  ticker: string;
  amount: number;
  addressIn: string;
  addressOut: string;
  callbackUrl: string;
  status: PaymentStatus;
  txidIn?: string;
  txidOut?: string;
  valueCoin?: string;
  confirmations?: number;
  cryptapiUuid?: string;
  expiresAt: Date;
  confirmedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const paymentSchema = new Schema<IPayment>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    network: { type: String, enum: ["eth", "bsc", "tron", "sol"], required: true },
    token: { type: String, enum: ["usdt", "usdc"], required: true },
    ticker: { type: String, required: true },
    amount: { type: Number, required: true },
    addressIn: { type: String, required: true },
    addressOut: { type: String, required: true },
    callbackUrl: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "confirming", "confirmed", "expired"],
      default: "pending",
    },
    txidIn: String,
    txidOut: String,
    valueCoin: String,
    confirmations: Number,
    cryptapiUuid: String,
    expiresAt: { type: Date, required: true },
    confirmedAt: Date,
  },
  { timestamps: true }
);

export const Payment = mongoose.model<IPayment>("Payment", paymentSchema);
