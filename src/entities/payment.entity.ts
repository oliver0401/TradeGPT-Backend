import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from "typeorm";

export type PaymentStatus = "pending" | "confirming" | "confirmed" | "expired";
export type PaymentNetwork = "eth" | "bsc" | "tron" | "sol";
export type PaymentToken = "usdt" | "usdc";

@Entity("payment")
export class PaymentEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "varchar", nullable: false })
  userId: string;

  @Column({ type: "varchar", nullable: false })
  network: PaymentNetwork;

  @Column({ type: "varchar", nullable: false })
  token: PaymentToken;

  @Column({ type: "varchar", nullable: false })
  ticker: string;

  @Column({ type: "decimal", precision: 10, scale: 2, nullable: false })
  amount: number;

  @Column({ type: "varchar", nullable: false })
  addressIn: string;

  @Column({ type: "varchar", nullable: false })
  addressOut: string;

  @Column({ type: "varchar", nullable: false })
  callbackUrl: string;

  @Column({ type: "varchar", default: "pending" })
  status: PaymentStatus;

  @Column({ type: "varchar", nullable: true })
  txidIn?: string;

  @Column({ type: "varchar", nullable: true })
  txidOut?: string;

  @Column({ type: "varchar", nullable: true })
  valueCoin?: string;

  @Column({ type: "int", nullable: true })
  confirmations?: number;

  @Column({ type: "varchar", nullable: true })
  cryptapiUuid?: string;

  @Column({ type: "timestamp", nullable: false })
  expiresAt: Date;

  @Column({ type: "timestamp", nullable: true })
  confirmedAt?: Date;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
