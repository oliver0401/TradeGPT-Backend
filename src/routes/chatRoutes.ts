import { Router } from "express";
import {
  createConversation,
  deleteAllConversations,
  deleteConversation,
  getConversation,
  listConversations,
  listModes,
  patchConversation,
  rollbackFromMessage,
  streamMessage,
} from "../controllers/chatController.js";
import { requireAuth } from "../middleware/requireAuth.js";

export const chatRouter = Router();

chatRouter.get("/modes", listModes);

chatRouter.use(requireAuth);
chatRouter.get("/conversations", listConversations);
chatRouter.post("/conversations", createConversation);
chatRouter.delete("/conversations", deleteAllConversations);
chatRouter.get("/conversations/:id", getConversation);
chatRouter.patch("/conversations/:id", patchConversation);
chatRouter.delete("/conversations/:id", deleteConversation);
chatRouter.post("/conversations/:id/rollback", rollbackFromMessage);
chatRouter.post("/conversations/:id/messages", streamMessage);
