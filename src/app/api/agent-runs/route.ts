import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

type AgentRun = {
  runId: string;
  timestamp: string;
  status: "running" | "resolved" | "feedback_only";
  [key: string]: unknown;
};

const dataDirectory = path.join(process.cwd(), ".local");
const dataFile = path.join(dataDirectory, "agent-runs.json");
const tempFile = path.join(dataDirectory, "agent-runs.tmp.json");

const corsHeaders = {
  "Access-Control-Allow-Origin":
    process.env.PLAYER_ORIGIN ?? "http://localhost:8080",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function GET() {
  const runs = await readRuns();
  return NextResponse.json(
    { runs: runs.slice(0, 20) },
    {
      headers: {
        ...corsHeaders,
        "Cache-Control": "no-store",
      },
    },
  );
}

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as Partial<AgentRun>;

  if (
    typeof payload.runId !== "string" ||
    typeof payload.timestamp !== "string" ||
    !["running", "resolved", "feedback_only"].includes(payload.status ?? "")
  ) {
    return NextResponse.json(
      { error: "Invalid agent run event" },
      { status: 400, headers: corsHeaders },
    );
  }

  const run = payload as AgentRun;
  const runs = await readRuns();
  const existingIndex = runs.findIndex((item) => item.runId === run.runId);

  if (existingIndex >= 0) {
    runs[existingIndex] = run;
  } else {
    runs.unshift(run);
  }

  if (runs.length > 50) runs.length = 50;
  await writeRuns(runs);

  return NextResponse.json({ accepted: true, run }, { headers: corsHeaders });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function DELETE() {
  await writeRuns([]);
  return NextResponse.json({ cleared: true }, { headers: corsHeaders });
}

async function readRuns(): Promise<AgentRun[]> {
  try {
    const contents = await readFile(dataFile, "utf8");
    const data: unknown = JSON.parse(contents);
    return Array.isArray(data) ? (data as AgentRun[]) : [];
  } catch (error) {
    if (isMissingFile(error)) return [];
    throw error;
  }
}

async function writeRuns(runs: AgentRun[]) {
  await mkdir(dataDirectory, { recursive: true });
  await writeFile(tempFile, JSON.stringify(runs, null, 2), "utf8");
  await rename(tempFile, dataFile);
}

function isMissingFile(error: unknown): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
