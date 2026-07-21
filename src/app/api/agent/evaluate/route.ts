import { NextRequest, NextResponse } from "next/server";

type CaseMetric = {
  id: string;
  label: string;
  sampleSize: number;
  agentSuccessRate: number;
  rulesSuccessRate: number;
};

type Evaluation = {
  source: "api" | "fallback";
  model: string | null;
  headline: string;
  summary: string;
  recommendations: Array<{
    caseId: string;
    mode: "agent" | "hybrid" | "rules";
    rationale: string;
  }>;
};

const globalCache = globalThis as typeof globalThis & {
  playbackEvaluationCache?: Map<string, Evaluation>;
};
const cache = globalCache.playbackEvaluationCache ?? new Map<string, Evaluation>();
globalCache.playbackEvaluationCache = cache;

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { cases?: CaseMetric[] };
  const cases = Array.isArray(body.cases) ? body.cases : [];

  if (!isValidCaseMetrics(cases)) {
    return NextResponse.json(
      { error: "Invalid case metrics" },
      { status: 400 },
    );
  }

  const cacheKey = JSON.stringify(cases);
  const cached = cache.get(cacheKey);
  if (cached) return NextResponse.json(cached);

  const fallback = createFallbackEvaluation(cases);
  const apiKey = process.env.AGENT_API_KEY;
  if (!apiKey) {
    cache.set(cacheKey, fallback);
    return NextResponse.json(fallback);
  }

  try {
    const evaluation = await requestModelEvaluation(cases, apiKey);
    cache.set(cacheKey, evaluation);
    return NextResponse.json(evaluation);
  } catch {
    cache.set(cacheKey, fallback);
    return NextResponse.json(fallback);
  }
}

function isValidCaseMetrics(cases: CaseMetric[]): boolean {
  return (
    cases.length > 0 &&
    cases.length <= 12 &&
    cases.every(
      (item) =>
        typeof item.id === "string" &&
        typeof item.label === "string" &&
        Number.isFinite(item.sampleSize) &&
        item.sampleSize >= 0 &&
        isRate(item.agentSuccessRate) &&
        isRate(item.rulesSuccessRate),
    )
  );
}

function isRate(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function createFallbackEvaluation(cases: CaseMetric[]): Evaluation {
  const ranked = [...cases].sort(
    (a, b) =>
      b.agentSuccessRate -
      b.rulesSuccessRate -
      (a.agentSuccessRate - a.rulesSuccessRate),
  );
  const strongest = ranked.slice(0, 2).map((item) => item.label);

  return {
    source: "fallback",
    model: null,
    headline: `Prioritize agent recovery for ${strongest.join(" and ")}`,
    summary:
      "Agent recovery adds the most value where diagnosis or the next action depends on live results. Keep stable, low-lift cases on deterministic playbooks first.",
    recommendations: cases.map((item) => {
      const lift = item.agentSuccessRate - item.rulesSuccessRate;
      const mode = lift >= 0.15 ? "agent" : lift >= 0.06 ? "hybrid" : "rules";
      return {
        caseId: item.id,
        mode,
        rationale:
          mode === "agent"
            ? `Agent improves verified resolution by ${Math.round(lift * 100)} points.`
            : mode === "hybrid"
              ? `Use rules first, then agent for unresolved cases; lift is ${Math.round(lift * 100)} points.`
              : `Only ${Math.round(lift * 100)} points of lift; the model cost is not yet justified.`,
      };
    }),
  };
}

async function requestModelEvaluation(
  cases: CaseMetric[],
  apiKey: string,
): Promise<Evaluation> {
  const apiUrl =
    process.env.AGENT_API_URL ??
    "https://api.openai.com/v1/chat/completions";
  const model = process.env.AGENT_MODEL ?? "gpt-4o-mini";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        messages: [
          {
            role: "system",
            content:
              "You evaluate aggregate playback recovery outcomes. Return JSON only. " +
              "Recommend agent when adaptive judgment materially improves verified resolution, hybrid when rules should run first, and rules when model lift does not justify cost. " +
              'Schema: {"headline":"string","summary":"string","recommendations":[{"caseId":"id","mode":"agent|hybrid|rules","rationale":"string"}]}. Include every provided case exactly once.',
          },
          {
            role: "user",
            content: JSON.stringify({
              metricDefinition:
                "Success requires healthy telemetry and viewer confirmation.",
              cases,
            }),
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Evaluation API returned ${response.status}`);
    }

    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error("Evaluation API returned no analysis");

    const parsed = parseJsonObject(content) as Partial<Evaluation>;
    const validIds = new Set(cases.map((item) => item.id));
    const recommendations = Array.isArray(parsed.recommendations)
      ? parsed.recommendations
      : [];
    const returnedIds = new Set(
      recommendations.map((item) => item.caseId),
    );

    if (
      typeof parsed.headline !== "string" ||
      typeof parsed.summary !== "string" ||
      recommendations.length !== cases.length ||
      returnedIds.size !== validIds.size ||
      recommendations.some(
        (item) =>
          !validIds.has(item.caseId) ||
          !["agent", "hybrid", "rules"].includes(item.mode) ||
          typeof item.rationale !== "string",
      )
    ) {
      throw new Error("Evaluation failed schema validation");
    }

    return {
      source: "api",
      model,
      headline: parsed.headline.slice(0, 180),
      summary: parsed.summary.slice(0, 500),
      recommendations: recommendations.map((item) => ({
        caseId: item.caseId,
        mode: item.mode,
        rationale: item.rationale.slice(0, 240),
      })),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function parseJsonObject(content: string): unknown {
  return JSON.parse(
    content
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, ""),
  );
}
