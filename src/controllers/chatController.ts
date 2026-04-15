import type { Request, Response } from "express";
import mongoose from "mongoose";
import OpenAI from "openai";
import { Conversation } from "../models/Conversation.js";
import { ChatMessage } from "../models/ChatMessage.js";
import {
  isTradeModeId,
  TRADE_MODES,
  type TradeModeId,
} from "../utils/tradeModes.js";
import {
  buildModelFallbackChain,
  isSearchPreviewModel,
  routeUserMessage,
} from "../utils/modelRouter.js";
import { buildOpenAIMessagesFromStoredThread } from "../utils/chatThread.js";
import { generateFollowUpQuestions } from "../utils/followUpSuggestionGenerator.js";

const FOLLOW_UP_TIMEOUT_MS = Number(process.env.FOLLOW_UP_TIMEOUT_MS ?? 60000);

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

export function listModes(_req: Request, res: Response): void {
  res.json({ modes: TRADE_MODES });
}

export async function listConversations(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const uid = new mongoose.Types.ObjectId(userId);
    const msgCollection = ChatMessage.collection.collectionName;

    const list = await Conversation.aggregate<{
      _id: mongoose.Types.ObjectId;
      title: string;
      mode: TradeModeId;
      updatedAt: Date;
      messageCount: number;
    }>([
      { $match: { userId: uid } },
      { $sort: { updatedAt: -1 } },
      { $limit: 50 },
      {
        $lookup: {
          from: msgCollection,
          let: { cid: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$conversationId", "$$cid"] } } },
            { $count: "n" },
          ],
          as: "cnt",
        },
      },
      {
        $addFields: {
          messageCount: {
            $cond: {
              if: { $gt: [{ $size: "$cnt" }, 0] },
              then: { $arrayElemAt: ["$cnt.n", 0] },
              else: 0,
            },
          },
        },
      },
      { $project: { cnt: 0 } },
    ]).exec();

    res.json({
      conversations: list.map((c) => ({
        id: c._id.toString(),
        title: c.title,
        mode: c.mode,
        updatedAt: c.updatedAt,
        messageCount: c.messageCount,
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
    const conv = await Conversation.create({
      userId,
      title: "New chat",
      mode: modeRaw as TradeModeId,
    });
    res.status(201).json({
      id: conv._id.toString(),
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
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: "Invalid conversation id" });
      return;
    }
    const conv = await Conversation.findOne({ _id: id, userId }).lean().exec();
    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    const messages = await ChatMessage.find({ conversationId: conv._id })
      .sort({ createdAt: 1 })
      .lean()
      .exec();
    res.json({
      id: conv._id.toString(),
      title: conv.title,
      mode: conv.mode,
      messages: messages.map((m) => ({
        id: m._id.toString(),
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
        ...(m.role === "user" && m.tradeMode
          ? { tradeMode: m.tradeMode }
          : {}),
        ...(m.suggestedQuestions?.length
          ? { suggestedQuestions: m.suggestedQuestions }
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
    if (!mongoose.Types.ObjectId.isValid(id)) {
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
    const conv = await Conversation.findOneAndUpdate(
      { _id: id, userId },
      { mode: modeRaw as TradeModeId },
      { new: true }
    )
      .lean()
      .exec();
    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    res.json({ id: conv._id.toString(), mode: conv.mode });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to update conversation" });
  }
}

/**
 * Delete a user message and all messages after it (by conversation order).
 * Used when editing a prior user message (ChatGPT-style).
 */
export async function rollbackFromMessage(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const convId = req.params.id;
    const fromMessageId = String(req.body?.fromMessageId ?? "");

    if (!mongoose.Types.ObjectId.isValid(convId) || !mongoose.Types.ObjectId.isValid(fromMessageId)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const conv = await Conversation.findOne({ _id: convId, userId }).exec();
    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    const msgs = await ChatMessage.find({ conversationId: conv._id })
      .sort({ createdAt: 1 })
      .lean()
      .exec();

    const idx = msgs.findIndex((m) => m._id.toString() === fromMessageId);
    if (idx === -1) {
      res.status(404).json({ error: "Message not found" });
      return;
    }

    if (msgs[idx].role !== "user") {
      res.status(400).json({ error: "Can only branch from a user message" });
      return;
    }

    const toDelete = msgs.slice(idx).map((m) => m._id);
    await ChatMessage.deleteMany({ _id: { $in: toDelete } });
    conv.updatedAt = new Date();
    await conv.save();

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
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: "Invalid conversation id" });
      return;
    }
    const conv = await Conversation.findOneAndDelete({ _id: id, userId }).lean().exec();
    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    await ChatMessage.deleteMany({ conversationId: conv._id });
    res.status(204).send();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to delete conversation" });
  }
}

export async function deleteAllConversations(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const convs = await Conversation.find({ userId }).select("_id").lean().exec();
    const ids = convs.map((c) => c._id);

    if (ids.length === 0) {
      res.json({ deletedConversations: 0, deletedMessages: 0 });
      return;
    }

    const [msgResult, convResult] = await Promise.all([
      ChatMessage.deleteMany({ conversationId: { $in: ids } }),
      Conversation.deleteMany({ _id: { $in: ids } }),
    ]);

    res.json({
      deletedConversations: convResult.deletedCount ?? ids.length,
      deletedMessages: msgResult.deletedCount ?? 0,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to delete conversations" });
  }
}

export async function streamMessage(req: Request, res: Response): Promise<void> {
  const userId = req.userId!;
  const id = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(id)) {
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
    const conv = await Conversation.findOne({ _id: id, userId }).exec();
    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    if (!isTradeModeId(conv.mode)) {
      res.status(500).json({ error: "Conversation has invalid mode" });
      return;
    }

    await ChatMessage.create({
      conversationId: conv._id,
      role: "user",
      content,
      tradeMode: conv.mode,
    });

    const prior = await ChatMessage.find({ conversationId: conv._id })
      .sort({ createdAt: 1, _id: 1 })
      .lean()
      .exec();

    const openaiMessages = buildOpenAIMessagesFromStoredThread(conv.mode, prior);

    if (conv.title === "New chat" && content.length > 0) {
      conv.title = content.slice(0, 60) + (content.length > 60 ? "…" : "");
      await conv.save();
    } else {
      conv.updatedAt = new Date();
      await conv.save();
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

    const assistantDoc = await ChatMessage.create({
      conversationId: conv._id,
      role: "assistant",
      content: full || "(No response)",
    });

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
          tradeMode: conv.mode,
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
        await ChatMessage.updateOne(
          { _id: assistantDoc._id },
          { suggestedQuestions }
        );
      }
    } catch {
      // non-critical — suggestions are best-effort
      followUpNotice =
        "Suggested questions were automatically withdrawn because generation failed.";
    }

    res.write(
      `data: ${JSON.stringify({
        type: "done",
        title: conv.title,
        model: usedModel,
        usedWebSearch,
        assistantMessageId: assistantDoc._id.toString(),
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
