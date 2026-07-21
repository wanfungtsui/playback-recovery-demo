import { NextRequest, NextResponse } from "next/server";

type Action = {
  id: string;
  label: string;
};

type DecisionRequest = {
  issueId?: string;
  issueLabel?: string;
  attempt?: number;
  userFeedback?: string;
  contentTitle?: string;
  device?: string;
  previousActionIds?: string[];
};

const actionCatalog: Record<string, string> = {
  switch_delivery_route: "Switch to a healthier video delivery route",
  stabilize_bitrate: "Tune video quality for the current connection",
  refresh_playback_session: "Refresh playback authorization",
  reload_content: "Reload content at the saved position",
  reset_video_decoder: "Reset the device video decoder",
  switch_video_codec: "Switch to a compatible video format",
  reload_subtitles: "Reload the active subtitle track",
  resync_subtitles: "Resynchronize subtitle timing",
  reload_audio: "Reload the active audio track",
  resync_audio: "Align audio with the current video frame",
  clear_quality_estimate: "Clear the cached connection estimate",
  request_fresh_quality_profile: "Request a fresh adaptive quality profile",
  renew_media_license: "Renew the protected media license",
  rebuild_playback_pipeline: "Rebuild the local playback pipeline",
  clear_content_cache: "Clear the stale content manifest cache",
  request_new_content_url: "Request a new signed content URL",
};

const corsHeaders = {
  "Access-Control-Allow-Origin":
    process.env.PLAYER_ORIGIN ?? "http://localhost:8080",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const allowedActionsByIssue: Record<string, string[]> = {
  buffering: [
    "switch_delivery_route",
    "stabilize_bitrate",
    "clear_quality_estimate",
    "request_fresh_quality_profile",
  ],
  stopped: [
    "refresh_playback_session",
    "reload_content",
    "renew_media_license",
    "rebuild_playback_pipeline",
  ],
  green_screen: [
    "reset_video_decoder",
    "reload_content",
    "switch_video_codec",
    "rebuild_playback_pipeline",
  ],
  subtitles: [
    "reload_subtitles",
    "resync_subtitles",
    "reload_content",
    "clear_content_cache",
  ],
  audio: [
    "reload_audio",
    "resync_audio",
    "reload_content",
    "rebuild_playback_pipeline",
  ],
  quality: [
    "clear_quality_estimate",
    "request_fresh_quality_profile",
    "switch_delivery_route",
    "stabilize_bitrate",
  ],
  content_loading: [
    "clear_content_cache",
    "request_new_content_url",
    "refresh_playback_session",
    "reload_content",
  ],
};

const fallbackDecisions: Record<
  string,
  {
    diagnosis: [string, string];
    actions: [string[], string[]];
  }
> = {
  buffering: {
    diagnosis: [
      "The current video delivery route is unstable.",
      "The route recovered, but the player is still using a stale bandwidth estimate.",
    ],
    actions: [
      ["switch_delivery_route", "stabilize_bitrate"],
      ["clear_quality_estimate", "request_fresh_quality_profile"],
    ],
  },
  stopped: {
    diagnosis: [
      "The playback session needs fresh authorization.",
      "Authorization is valid, but the local media pipeline did not recover.",
    ],
    actions: [
      ["refresh_playback_session", "reload_content"],
      ["renew_media_license", "rebuild_playback_pipeline"],
    ],
  },
  green_screen: {
    diagnosis: [
      "The device decoder is not rendering the current video format correctly.",
      "The decoder reset completed, but this format remains incompatible.",
    ],
    actions: [
      ["reset_video_decoder", "reload_content"],
      ["switch_video_codec", "rebuild_playback_pipeline"],
    ],
  },
  subtitles: {
    diagnosis: [
      "The subtitle track is stale or its timing no longer matches the video.",
      "The track reloaded, but the cached subtitle manifest is still inconsistent.",
    ],
    actions: [
      ["reload_subtitles", "resync_subtitles"],
      ["clear_content_cache", "reload_content"],
    ],
  },
  audio: {
    diagnosis: [
      "The audio track timing drifted from the video.",
      "The primary audio track still reports an inconsistent timestamp.",
    ],
    actions: [
      ["reload_audio", "resync_audio"],
      ["reload_content", "rebuild_playback_pipeline"],
    ],
  },
  quality: {
    diagnosis: [
      "The player selected a profile below the available connection capacity.",
      "The quality estimate remains too conservative after the first adjustment.",
    ],
    actions: [
      ["clear_quality_estimate", "request_fresh_quality_profile"],
      ["switch_delivery_route", "stabilize_bitrate"],
    ],
  },
  content_loading: {
    diagnosis: [
      "The player has a stale content manifest or signed URL.",
      "The refreshed manifest still points to an expired content location.",
    ],
    actions: [
      ["clear_content_cache", "request_new_content_url"],
      ["refresh_playback_session", "reload_content"],
    ],
  },
};

export async function POST(request: NextRequest) {
  const input = (await request.json()) as DecisionRequest;
  const issueId = input.issueId ?? "";
  const attempt = input.attempt === 2 ? 2 : 1;
  const fallback = createFallbackDecision(issueId, attempt);

  if (!fallback) {
    return NextResponse.json(
      { error: "Unsupported playback issue" },
      { status: 400, headers: corsHeaders },
    );
  }

  const apiKey = process.env.AGENT_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        ...fallback,
        source: "fallback",
        model: null,
        fallbackReason: "AGENT_API_KEY is not configured",
      },
      { headers: corsHeaders },
    );
  }

  try {
    const decision = await requestModelDecision(input, issueId, attempt, apiKey);
    return NextResponse.json(decision, { headers: corsHeaders });
  } catch (error) {
    return NextResponse.json(
      {
        ...fallback,
        source: "fallback",
        model: null,
        fallbackReason:
          error instanceof Error ? error.message : "Agent API request failed",
      },
      { headers: corsHeaders },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

function createFallbackDecision(issueId: string, attempt: number) {
  const fallback = fallbackDecisions[issueId];
  if (!fallback) return null;

  const index = attempt - 1;
  return {
    attempt,
    diagnosis: fallback.diagnosis[index],
    actions: fallback.actions[index].map(toAction),
  };
}

async function requestModelDecision(
  input: DecisionRequest,
  issueId: string,
  attempt: number,
  apiKey: string,
) {
  const previousActionIds = Array.isArray(input.previousActionIds)
    ? input.previousActionIds
    : [];
  const allowedIds = allowedActionsByIssue[issueId].filter(
    (id) => !previousActionIds.includes(id),
  );
  if (allowedIds.length < 2) {
    throw new Error("No distinct safe recovery path remains");
  }
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
              "You are a bounded playback recovery planner. Return JSON only. " +
              "Never invent actions. Select exactly two different actionIds from the provided allowlist. " +
              "Provide a concise customer-safe diagnosis. " +
              'Schema: {"diagnosis":"string","actionIds":["id","id"]}.',
          },
          {
            role: "user",
            content: JSON.stringify({
              issue: {
                id: issueId,
                label: input.issueLabel,
              },
              attempt,
              userFeedback: input.userFeedback,
              session: {
                contentTitle: input.contentTitle,
                device: input.device,
              },
              allowedActionIds: allowedIds,
            }),
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Agent API returned ${response.status}`);
    }

    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error("Agent API returned no decision");

    const parsed = parseJsonObject(content) as {
      diagnosis?: unknown;
      actionIds?: unknown;
    };
    const actionIds = Array.isArray(parsed.actionIds)
      ? parsed.actionIds.filter(
          (id): id is string =>
            typeof id === "string" && allowedIds.includes(id),
        )
      : [];

    if (
      typeof parsed.diagnosis !== "string" ||
      actionIds.length !== 2 ||
      new Set(actionIds).size !== 2
    ) {
      throw new Error("Agent API decision failed schema validation");
    }

    return {
      source: "api",
      model,
      fallbackReason: null,
      attempt,
      diagnosis: parsed.diagnosis.slice(0, 240),
      actions: actionIds.map(toAction),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function toAction(id: string): Action {
  return { id, label: actionCatalog[id] };
}

function parseJsonObject(content: string): unknown {
  const trimmed = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return JSON.parse(trimmed);
}
