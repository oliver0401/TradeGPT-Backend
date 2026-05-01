import type { Request, Response } from "express";
import { In } from "typeorm";
import OpenAI from "openai";
import { AppDataSource } from "../setup";
import { ConversationEntity } from "../entities/conversation.entity";
import { ChatMessageEntity } from "../entities/chatMessage.entity";
import {
  isTradeModeId,
  TRADE_MODES,
  type TradeModeId,
} from "../utils/tradeModes";
import {
  buildModelFallbackChain,
  isSearchPreviewModel,
  routeUserMessage,
} from "../utils/modelRouter";
import { buildOpenAIMessagesFromStoredThread } from "../utils/chatThread";
import { generateFollowUpQuestions } from "../utils/followUpSuggestionGenerator";

const FOLLOW_UP_TIMEOUT_MS = Number(process.env.FOLLOW_UP_TIMEOUT_MS ?? 60000);

const convRepo = () => AppDataSource.getRepository(ConversationEntity);
const msgRepo = () => AppDataSource.getRepository(ChatMessageEntity);

function isValidId(id: string): boolean {
  const n = Number(id);
  return Number.isInteger(n) && n > 0;
}

function afterDelay(ms: number): Promise<"timeout"> {
  return new Promise((resolve) => {
    setTimeout(() => resolve("timeout"), ms);
  });
}

function getOpenAI(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  return new OpenAI({ apiKey: key });
}

function parseSuggestions(raw?: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function listModes(_req: Request, res: Response): void {
  res.json({ modes: TRADE_MODES });
}

export async function listConversations(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.userId!;

    const list = await convRepo()
      .createQueryBuilder("conv")
      .leftJoin(ChatMessageEntity, "msg", "msg.conversationId = conv.id")
      .select("conv.id", "id")
      .addSelect("conv.title", "title")
      .addSelect("conv.mode", "mode")
      .addSelect("conv.updatedAt", "updatedAt")
      .addSelect("COUNT(msg.id)", "messageCount")
      .where("conv.userId = :userId", { userId })
      .groupBy("conv.id")
      .orderBy("conv.updatedAt", "DESC")
      .limit(50)
      .getRawMany();

    res.json({
      conversations: list.map((c) => ({
        id: String(c.id),
        title: c.title,
        mode: c.mode,
        updatedAt: c.updatedAt,
        messageCount: Number(c.messageCount) || 0,
      })),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to list conversations" });
  }
}

export async function createConversation(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const modeRaw = String(req.body?.mode ?? "market_analysis");
    if (!isTradeModeId(modeRaw)) {
      res.status(400).json({ error: "Invalid mode" });
      return;
    }
    const conv = await convRepo().save(
      convRepo().create({
        userId,
        title: "New chat",
        mode: modeRaw as TradeModeId,
      })
    );
    res.status(201).json({
      id: String(conv.id),
      title: conv.title,
      mode: conv.mode,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to create conversation" });
  }
}

export async function getConversation(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const id = req.params.id;
    if (!isValidId(id)) {
      res.status(400).json({ error: "Invalid conversation id" });
      return;
    }
    const conv = await convRepo().findOne({ where: { id: Number(id), userId } });
    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    const messages = await msgRepo().find({
      where: { conversationId: conv.id },
      order: { createdAt: "ASC" },
    });
    res.json({
      id: String(conv.id),
      title: conv.title,
      mode: conv.mode,
      messages: messages.map((m) => ({
        id: String(m.id),
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
        ...(m.role === "user" && m.tradeMode
          ? { tradeMode: m.tradeMode }
          : {}),
        ...(parseSuggestions(m.suggestedQuestions).length
          ? { suggestedQuestions: parseSuggestions(m.suggestedQuestions) }
          : {}),
      })),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load conversation" });
  }
}

export async function patchConversation(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const id = req.params.id;
    if (!isValidId(id)) {
      res.status(400).json({ error: "Invalid conversation id" });
      return;
    }
    const modeRaw = req.body?.mode;
    if (modeRaw === undefined) {
      res.status(400).json({ error: "mode is required" });
      return;
    }
    if (!isTradeModeId(String(modeRaw))) {
      res.status(400).json({ error: "Invalid mode" });
      return;
    }

    const conv = await convRepo().findOne({ where: { id: Number(id), userId } });
    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    conv.mode = modeRaw as TradeModeId;
    await convRepo().save(conv);
    res.json({ id: String(conv.id), mode: conv.mode });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to update conversation" });
  }
}

export async function rollbackFromMessage(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const convId = req.params.id;
    const fromMessageId = String(req.body?.fromMessageId ?? "");

    if (!isValidId(convId) || !isValidId(fromMessageId)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const conv = await convRepo().findOne({ where: { id: Number(convId), userId } });
    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    const msgs = await msgRepo().find({
      where: { conversationId: conv.id },
      order: { createdAt: "ASC" },
    });

    const idx = msgs.findIndex((m) => String(m.id) === fromMessageId);
    if (idx === -1) {
      res.status(404).json({ error: "Message not found" });
      return;
    }

    if (msgs[idx].role !== "user") {
      res.status(400).json({ error: "Can only branch from a user message" });
      return;
    }

    const toDelete = msgs.slice(idx).map((m) => m.id);
    await msgRepo().delete(toDelete);
    conv.updatedAt = new Date();
    await convRepo().save(conv);

    res.json({ ok: true, removed: toDelete.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to update messages" });
  }
}

export async function deleteConversation(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const id = req.params.id;
    if (!isValidId(id)) {
      res.status(400).json({ error: "Invalid conversation id" });
      return;
    }
    const conv = await convRepo().findOne({ where: { id: Number(id), userId } });
    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    await msgRepo().delete({ conversationId: conv.id });
    await convRepo().remove(conv);
    res.status(204).send();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to delete conversation" });
  }
}

export async function deleteAllConversations(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const convs = await convRepo().find({ where: { userId }, select: ["id"] });
    const ids = convs.map((c) => c.id);

    if (ids.length === 0) {
      res.json({ deletedConversations: 0, deletedMessages: 0 });
      return;
    }

    const msgResult = await msgRepo().delete({ conversationId: In(ids) });
    const convResult = await convRepo().delete({ id: In(ids) });

    res.json({
      deletedConversations: convResult.affected ?? ids.length,
      deletedMessages: msgResult.affected ?? 0,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to delete conversations" });
  }
}

export async function streamMessage(req: Request, res: Response): Promise<void> {
  const userId = req.userId!;
  const id = req.params.id;
  if (!isValidId(id)) {
    res.status(400).json({ error: "Invalid conversation id" });
    return;
  }

  const openai = getOpenAI();
  if (!openai) {
    res.status(503).json({ error: "OpenAI API is not configured on the server" });
    return;
  }

  const content = String(req.body?.content ?? "").trim();
  if (!content) {
    res.status(400).json({ error: "Message content is required" });
    return;
  }

  try {
    const conv = await convRepo().findOne({ where: { id: Number(id), userId } });
    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    if (!isTradeModeId(conv.mode)) {
      res.status(500).json({ error: "Conversation has invalid mode" });
      return;
    }

    await msgRepo().save(
      msgRepo().create({
        conversationId: conv.id,
        role: "user",
        content,
        tradeMode: conv.mode,
      })
    );

    const prior = await msgRepo().find({
      where: { conversationId: conv.id },
      order: { createdAt: "ASC", id: "ASC" },
    });

    const openaiMessages = buildOpenAIMessagesFromStoredThread(conv.mode as TradeModeId, prior);

    if (conv.title === "New chat" && content.length > 0) {
      conv.title = content.slice(0, 60) + (content.length > 60 ? "\u2026" : "");
      await convRepo().save(conv);
    } else {
      conv.updatedAt = new Date();
      await convRepo().save(conv);
    }

    const route = await routeUserMessage(openai, {
      userText: content,
      tradeMode: conv.mode,
    });
    const modelCandidates = buildModelFallbackChain(route);
    if (process.env.NODE_ENV !== "production") {
      console.info(
        "[TradeGPT route]",
        JSON.stringify({
          needs_web_search: route.needs_web_search,
          complexity: route.complexity,
          reason: route.reason,
          models: modelCandidates,
        })
      );
    }

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    let full = "";
    let usedModel = "";
    let usedWebSearch = false;
    let lastModelError: unknown = null;

    for (const model of modelCandidates) {
      let attemptFull = "";
      try {
        const stream = await openai.chat.completions.create({
          model,
          messages: openaiMessages,
          stream: true,
        });
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content ?? "";
          if (delta) {
            attemptFull += delta;
            res.write(`data: ${JSON.stringify({ type: "delta", content: delta })}\n\n`);
          }
        }
        full = attemptFull;
        usedModel = model;
        usedWebSearch = isSearchPreviewModel(model);
        break;
      } catch (err) {
        if (attemptFull.length > 0) {
          throw err;
        }
        lastModelError = err;
        console.warn(
          `OpenAI model "${model}" failed, trying next fallback:`,
          err instanceof Error ? err.message : err
        );
      }
    }

    if (!usedModel) {
      throw lastModelError ?? new Error("No chat model succeeded");
    }

    const assistantDoc = await msgRepo().save(
      msgRepo().create({
        conversationId: conv.id,
        role: "assistant",
        content: full || "(No response)",
      })
    );

    const transcript = prior
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));
    transcript.push({
      role: "assistant",
      content: full || "(No response)",
    });

    let suggestedQuestions: string[] = [];
    let followUpStatus: "ready" | "withdrawn" = "withdrawn";
    let followUpNotice: string | undefined =
      "Suggested questions were automatically withdrawn because generation did not complete in time.";
    try {
      const suggestionResult = await Promise.race([
        generateFollowUpQuestions(openai, {
          tradeMode: conv.mode as TradeModeId,
          transcript,
        }),
        afterDelay(FOLLOW_UP_TIMEOUT_MS),
      ]);

      if (suggestionResult !== "timeout") {
        suggestedQuestions = suggestionResult.questions;
        if (suggestedQuestions.length > 0) {
          followUpStatus = "ready";
          followUpNotice = undefined;
        } else if (suggestionResult.errorCode === "billing_issue") {
          followUpNotice =
            "Suggested questions are unavailable right now due to an OpenAI billing/quota issue.";
        } else {
          followUpNotice =
            "Suggested questions were automatically withdrawn because generation failed.";
        }
      }

      if (suggestedQuestions.length > 0) {
        await msgRepo().update(
          { id: assistantDoc.id },
          { suggestedQuestions: JSON.stringify(suggestedQuestions) }
        );
      }
    } catch {
      followUpNotice =
        "Suggested questions were automatically withdrawn because generation failed.";
    }

    res.write(
      `data: ${JSON.stringify({
        type: "done",
        title: conv.title,
        model: usedModel,
        usedWebSearch,
        assistantMessageId: String(assistantDoc.id),
        suggestedQuestions,
        followUpStatus,
        ...(followUpStatus === "withdrawn" && followUpNotice
          ? { followUpNotice }
          : {}),
        router: {
          needs_web_search: route.needs_web_search,
          complexity: route.complexity,
          reason: route.reason,
        },
      })}\n\n`
    );
    res.end();
  } catch (e) {
    console.error(e);
    if (!res.headersSent) {
      res.status(500).json({ error: "Chat request failed" });
      return;
    }
    try {
      res.write(
        `data: ${JSON.stringify({
          type: "error",
          message: e instanceof Error ? e.message : "Chat failed",
        })}\n\n`
      );
    } catch {
      // ignore
    }
    res.end();
  }
}
