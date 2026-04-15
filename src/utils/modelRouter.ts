import type OpenAI from "openai";

/** Small, fast model for routing only (fixed; not read from env). */
const ROUTER_MODEL = "gpt-4o-mini";

const ROUTER_SYSTEM = `You are a routing engine for TradeGPT, a crypto trading assistant.

Return a single JSON object with exactly these keys:
- "needs_web_search": boolean — true if answering well requires current or recent information from the internet. Examples: today's or this week's news, current events, "latest" regulation, live prices or funding when the user did NOT paste numbers, verifying dates after 2024, new listings, breaking macro, "what happened", Twitter/social trends, sports scores, weather. Set false for definitions, psychology, risk education, pure hypotheticals with user-supplied prices, math, or generic strategy when no live facts are required.
- "complexity": "low" | "medium" | "high" — low for short or simple replies; medium for structured multi-section answers; high for deep reasoning, many constraints, or long-form analysis.
- "reason": string — one short phrase explaining your choice (optional but preferred).

Consider the given "Trade mode" when deciding (e.g. news_sentiment about current events often needs_web_search true).

Output valid JSON only. No markdown fences.`;

export type RouteDecision = {
  needs_web_search: boolean;
  complexity: "low" | "medium" | "high";
  reason?: string;
};

function normalizeRoute(parsed: Record<string, unknown>): RouteDecision {
  const webRaw = parsed.needs_web_search ?? parsed.needsWebSearch;
  const needs_web_search = webRaw === true || webRaw === "true";

  const c = String(parsed.complexity ?? "medium").toLowerCase();
  const complexity: RouteDecision["complexity"] =
    c === "low" ? "low" : c === "high" ? "high" : "medium";

  const reason =
    typeof parsed.reason === "string" && parsed.reason.trim()
      ? parsed.reason.trim().slice(0, 200)
      : undefined;

  return { needs_web_search, complexity, reason };
}

const DEFAULT_ROUTE: RouteDecision = {
  needs_web_search: false,
  complexity: "medium",
};

/**
 * Classify the latest user turn to pick model tier and whether built-in web search is appropriate.
 */
export async function routeUserMessage(
  openai: OpenAI,
  params: { userText: string; tradeMode: string }
): Promise<RouteDecision> {
  const text = params.userText.slice(0, 8000);
  const userBlock = `Trade mode: ${params.tradeMode}\n\nUser message:\n${text}`;

  try {
    const completion = await openai.chat.completions.create({
      model: ROUTER_MODEL,
      temperature: 0.1,
      max_tokens: 220,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: ROUTER_SYSTEM },
        { role: "user", content: userBlock },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "{}";
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return normalizeRoute(parsed);
  } catch (e) {
    console.warn("Model router failed, using defaults:", e);
    return { ...DEFAULT_ROUTE };
  }
}

/**
 * Ordered list of chat completion models to try. Later entries are fallbacks if the account lacks a model.
 * Web search uses OpenAI search-preview models (built-in browsing per OpenAI docs).
 */
export function buildModelFallbackChain(decision: RouteDecision): string[] {
  const { needs_web_search, complexity } = decision;

  if (needs_web_search) {
    if (complexity === "high") {
      return [
        "gpt-4o-search-preview",
        "gpt-5-search-api",
        "gpt-4o-mini-search-preview",
        "gpt-4o",
        "gpt-4o-mini",
      ];
    }
    return [
      "gpt-4o-mini-search-preview",
      "gpt-4o-search-preview",
      "gpt-5-search-api",
      "gpt-4o-mini",
      "gpt-4o",
    ];
  }

  if (complexity === "high") {
    return ["o4-mini", "o3-mini", "gpt-4o", "gpt-4o-mini"];
  }
  if (complexity === "medium") {
    return ["gpt-4o", "gpt-4o-mini"];
  }
  return ["gpt-4o-mini", "gpt-4o"];
}

export function isSearchPreviewModel(model: string): boolean {
  return /search-preview|search-api/i.test(model);
}
