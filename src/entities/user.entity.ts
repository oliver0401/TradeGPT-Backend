import { Entity, Column, PrimaryGeneratedColumn } from "typeorm";
import { CoreEntity } from "./core.entity";

export enum PaymentMethod {
  FREE = "free",
  PRO = "pro",
}

export enum AuthProvider {
  GOOGLE = "google",
  EMAIL = "email",
}

export enum UserRole {
  USER = "user",
  ADMIN = "admin",
}

@Entity("user")
export class UserEntity extends CoreEntity {
  @PrimaryGeneratedColumn("uuid")
  uuid: string;

  @Column({ type: "varchar", nullable: true })
  walletAddress?: string;

  @Column({ type: "decimal", precision: 10, scale: 2, default: 0 })
  balance: number;

  @Column({ type: "enum", enum: PaymentMethod, default: PaymentMethod.FREE })
  paymentMethod: PaymentMethod;

  @Column({ type: "timestamp", nullable: true })
  billingDate?: Date;

  @Column({ type: "timestamp", nullable: true })
  trialExpiresAt?: Date | null;

  @Column({ type: "timestamp", nullable: true })
  proGraceUntil?: Date | null;

  @Column({ type: "boolean", default: false })
  proCancelAtPeriodEnd: boolean;

  @Column({ type: "enum", enum: UserRole, default: UserRole.USER })
  role: UserRole;

  @Column({ type: "varchar", nullable: false })
  email: string;

  @Column({ type: "enum", enum: AuthProvider, default: AuthProvider.GOOGLE })
  authProvider: AuthProvider;

  @Column({ type: "varchar", nullable: true })
  passwordHash?: string;

  @Column({ type: "varchar", nullable: true })
  fullName?: string;

  @Column({ type: "varchar", default: false })
  onboarded: boolean;

  @Column({ type: "int", default: 0 })
  onboardingStep: number;

  @Column({ type: "varchar", nullable: true })
  avatar?: string;

  @Column({ type: "boolean", default: false })
  emailVerified: boolean;

  @Column({ type: "varchar", nullable: true })
  verificationCode?: string | null;

  @Column({ type: "timestamp", nullable: true })
  verificationCodeExpiresAt?: Date | null;

  @Column({ type: "varchar", nullable: true })
  passwordResetCode?: string | null;

  @Column({ type: "timestamp", nullable: true })
  passwordResetCodeExpiresAt?: Date | null;

  @Column({ type: "varchar", nullable: true })
  newSignInCode?: string | null;

  @Column({ type: "timestamp", nullable: true })
  newSignInCodeExpiresAt?: Date | null;

  @Column({ type: "varchar", default: "Crypto#Blockchain" })
  newsKeywords?: string | null;
}
