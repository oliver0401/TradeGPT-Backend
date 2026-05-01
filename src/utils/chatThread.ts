import type OpenAI from "openai";
import { getSystemPrompt, type TradeModeId } from "./tradeModes";

/**
 * Appended to the mode system prompt so the model reliably uses the full thread.
 */
const THREAD_CONTINUITY = `

## Conversation continuity
You are in **one continuous chat**. The messages after this system message are the **complete** conversation so far, in **chronological order** (oldest first, newest last).

- Use **all** earlier user and assistant turns when they are relevant: follow-ups, clarifications, definitions, levels, or plans mentioned before count.
- If the user says things like "as above", "earlier", "you said", or "that setup", resolve them from this history.
- Stay consistent with what you already stated unless the user corrects you or new instructions override it.
- If something essential is missing from the thread, ask briefly; otherwise prefer reasoning from the history you already have.`;

export type StoredThreadMessage = {
  role: string;
  content: string;
};

/**
 * Builds Chat Completions `messages`: one system message (mode + continuity) + full user/assistant thread.
 */
export function buildOpenAIMessagesFromStoredThread(
  mode: TradeModeId,
  stored: StoredThreadMessage[]
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const chronological = stored
    .filter((m) => m.role === "user" || m.role === "assistant")
    .filter((m) => typeof m.content === "string" && m.content.trim().length > 0)
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

  return [
    {
      role: "system",
      content: getSystemPrompt(mode) + THREAD_CONTINUITY,
    },
    ...chronological,
  ];
}
