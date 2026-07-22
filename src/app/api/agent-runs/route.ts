import { Redis } from "@upstash/redis";
import { NextRequest, NextResponse } from "next/server";
import type { DemoRun } from "../../DemoPlayer";

const RUN_INDEX_KEY = "playback-demo:runs";
const RUN_KEY_PREFIX = "playback-demo:run:";
const MAX_RUNS = 100;
const RUN_TTL_SECONDS = 60 * 60 * 24 * 30;

const globalStore = globalThis as typeof globalThis & {
  playbackRunStore?: Map<string, DemoRun>;
};
const memoryStore =
  globalStore.playbackRunStore ?? new Map<string, DemoRun>();
globalStore.playbackRunStore = memoryStore;

function getRedis() {
  const url =
    process.env.KV_REST_API_URL ??
    process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ??
    process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? new Redis({ url, token }) : null;
}

export async function GET(request: NextRequest) {
  const requestedLimit = Number(request.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.round(requestedLimit), 1), 50)
    : 20;
  const redis = getRedis();

  if (!redis) {
    const runs = [...memoryStore.values()]
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .slice(0, limit);
    return NextResponse.json(
      { runs, storage: "memory" },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const runIds = await redis.zrange<string[]>(
      RUN_INDEX_KEY,
      0,
      limit - 1,
      { rev: true },
    );
    const runs = (
      await Promise.all(
        runIds.map((runId) =>
          redis.get<DemoRun>(`${RUN_KEY_PREFIX}${runId}`),
        ),
      )
    ).filter((run): run is DemoRun => run !== null);

    return NextResponse.json(
      { runs, storage: "upstash" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Run store is temporarily unavailable" },
      { status: 503 },
    );
  }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (rawBody.length > 64_000) {
    return NextResponse.json({ error: "Run payload is too large" }, { status: 413 });
  }

  let run: DemoRun;
  try {
    run = JSON.parse(rawBody) as DemoRun;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isValidRun(run)) {
    return NextResponse.json({ error: "Invalid run payload" }, { status: 400 });
  }

  const redis = getRedis();
  if (!redis) {
    memoryStore.set(run.runId, run);
    trimMemoryStore();
    return NextResponse.json({ run, storage: "memory" });
  }

  try {
    const score = Date.parse(run.updatedAt);
    const pipeline = redis.pipeline();
    pipeline.set(`${RUN_KEY_PREFIX}${run.runId}`, run, {
      ex: RUN_TTL_SECONDS,
    });
    pipeline.zadd(RUN_INDEX_KEY, { score, member: run.runId });
    pipeline.zremrangebyrank(RUN_INDEX_KEY, 0, -(MAX_RUNS + 1));
    await pipeline.exec();
    return NextResponse.json({ run, storage: "upstash" });
  } catch {
    return NextResponse.json(
      { error: "Run could not be persisted" },
      { status: 503 },
    );
  }
}

function isValidRun(run: DemoRun) {
  return (
    typeof run === "object" &&
    run !== null &&
    /^run_[a-zA-Z0-9_-]+$/.test(run.runId) &&
    typeof run.issueId === "string" &&
    typeof run.issueLabel === "string" &&
    typeof run.timestamp === "string" &&
    Number.isFinite(Date.parse(run.timestamp)) &&
    typeof run.updatedAt === "string" &&
    Number.isFinite(Date.parse(run.updatedAt)) &&
    ["running", "resolved", "feedback_only"].includes(run.status) &&
    Array.isArray(run.steps) &&
    run.steps.length <= 50 &&
    run.steps.every(
      (step) =>
        typeof step.phase === "string" &&
        typeof step.title === "string" &&
        typeof step.detail === "string" &&
        ["user", "system", "agent", "tool"].includes(step.owner),
    ) &&
    Array.isArray(run.signals) &&
    run.signals.length <= 10
  );
}

function trimMemoryStore() {
  if (memoryStore.size <= MAX_RUNS) return;
  const oldest = [...memoryStore.values()].sort(
    (a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt),
  )[0];
  if (oldest) memoryStore.delete(oldest.runId);
}
