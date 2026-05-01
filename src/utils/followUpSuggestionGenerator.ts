import type OpenAI from "openai";
import type { TradeModeId } from "./tradeModes";
import { TRADE_MODES } from "./tradeModes";

const MAX_MESSAGES = 8;
const MAX_CHARS_PER_MESSAGE = 2000;
const TARGET_COUNT = 3;

const SYSTEM = `You suggest follow-up questions for a trading / markets chat.

Return a single JSON object with exactly one key "questions" whose value is an array of strings.
Provide exactly ${TARGET_COUNT} short questions the user might ask next. Each question must:
- Be specific to the topics and details in the conversation (not generic filler).
- Flow naturally from what was just discussed.
- Be one line each, under 120 characters when possible.

Output valid JSON only. No markdown fences.`;

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function modeLabel(mode: TradeModeId): string {
  return TRADE_MODES.find((m) => m.id === mode)?.label ?? mode;
}

export async function generateFollowUpQuestions(
  openai: OpenAI,
  params: {
    tradeMode: TradeModeId;
    transcript: { role: "user" | "assistant"; content: string }[];
  }
): Promise<{ questions: string[]; errorCode?: string }> {
  const model =
    process.env.OPENAI_SUGGESTIONS_MODEL?.trim() || "gpt-4o-mini";

  const slice = params.transcript.slice(-MAX_MESSAGES);
  const lines = slice.map((m) => {
    const role = m.role === "user" ? "User" : "Assistant";
    return `${role}: ${truncate(m.content, MAX_CHARS_PER_MESSAGE)}`;
  });
  const userBlock = `Trade mode: ${modeLabel(params.tradeMode)} (${params.tradeMode})

Conversation (most recent last):
${lines.join("\n\n")}`;

  try {
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.45,
      max_tokens: 400,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userBlock },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "{}";
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const arr = parsed.questions ?? parsed.suggestedQuestions;
    if (!Array.isArray(arr)) return { questions: [] };

    const out: string[] = [];
    for (const item of arr) {
      if (typeof item !== "string") continue;
      const q = item.trim();
      if (q.length > 0 && q.length <= 500) out.push(q);
      if (out.length >= TARGET_COUNT) break;
    }
    return { questions: out };
  } catch (e) {
    console.warn("Follow-up suggestion generation failed:", e);
    const msg = e instanceof Error ? e.message.toLowerCase() : "";
    const code =
      msg.includes("insufficient_quota") ||
      msg.includes("quota") ||
      msg.includes("billing")
        ? "billing_issue"
        : "generation_failed";
    return { questions: [], errorCode: code };
  }
}
