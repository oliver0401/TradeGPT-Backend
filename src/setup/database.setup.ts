import { DataSource } from "typeorm";
import { SnakeNamingStrategy } from "typeorm-naming-strategies";
import {
  UserEntity,
  PendingUserEntity,
  PaymentEntity,
  ConversationEntity,
  ChatMessageEntity,
} from "@/entities";
import "dotenv/config";
import { Env } from "@/env";

export const AppDataSource = new DataSource({
  type: "mysql",
  database: Env.dbName,
  host: Env.host,
  username: Env.username,
  password: Env.password,
  port: Env.dbPort,
  logging: false,
  synchronize: true,
  entities: [
    UserEntity,
    PendingUserEntity,
    PaymentEntity,
    ConversationEntity,
    ChatMessageEntity,
  ],
  entitySkipConstructor: true,
  namingStrategy: new SnakeNamingStrategy(),
});
