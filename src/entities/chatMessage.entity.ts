import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from "typeorm";

export type ChatRole = "user" | "assistant" | "system";

@Entity("chat_message")
export class ChatMessageEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "int", nullable: false })
  conversationId: number;

  @Column({ type: "varchar", nullable: false })
  role: ChatRole;

  @Column({ type: "text", nullable: false })
  content: string;

  @Column({ type: "varchar", nullable: true })
  tradeMode?: string;

  @Column({ type: "text", nullable: true })
  suggestedQuestions?: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;
}
