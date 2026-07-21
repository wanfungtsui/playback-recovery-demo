"use client";

import {
  Check,
  ChevronRight,
  HelpCircle,
  MessageCircle,
  Play,
  ShieldCheck,
  Sparkles,
  Volume2,
} from "lucide-react";
import { useRef, useState } from "react";

export type RunStep = {
  phase: string;
  title: string;
  detail: string;
  owner: "system" | "agent" | "tool";
};

export type DemoRun = {
  runId: string;
  timestamp: string;
  status: "running" | "resolved" | "feedback_only";
  contentTitle: string;
  sessionId: string;
  issueLabel: string;
  diagnosis: string | null;
  steps: RunStep[];
  timeToRecoverSeconds: number | null;
  escalated: boolean;
  decisionSource: "api" | "fallback" | "local_fallback";
  model: string | null;
};

type Issue = {
  id: string;
  label: string;
  description: string;
  diagnosis: [string, string];
  actions: [[string, string], [string, string]];
};

type AgentPlan = {
  source: "api" | "fallback";
  model: string | null;
  diagnosis: string;
  actions: Array<{ id: string; label: string }>;
};

type Stage =
  | "closed"
  | "issues"
  | "consent"
  | "running"
  | "confirm"
  | "resolved"
  | "handoff";

const issues: Issue[] = [
  {
    id: "buffering",
    label: "Video keeps buffering",
    description: "Playback pauses or shows a loading spinner.",
    diagnosis: [
      "The current video delivery route is unstable.",
      "The player is still using a stale bandwidth estimate.",
    ],
    actions: [
      ["Switch to a healthier delivery route", "Stabilize video quality"],
      ["Reset the connection estimate", "Request a fresh quality profile"],
    ],
  },
  {
    id: "stopped",
    label: "Video stopped playing",
    description: "The video froze or returned to loading.",
    diagnosis: [
      "The playback session needs fresh authorization.",
      "The local media pipeline did not recover cleanly.",
    ],
    actions: [
      ["Refresh playback authorization", "Reload content at the saved position"],
      ["Renew the media license", "Rebuild the playback pipeline"],
    ],
  },
  {
    id: "green_screen",
    label: "The screen is green",
    description: "Audio continues, but the picture is green.",
    diagnosis: [
      "The device decoder is not rendering this video format correctly.",
      "The current video format remains incompatible after a decoder reset.",
    ],
    actions: [
      ["Reset the video decoder", "Reload content at the saved position"],
      ["Switch to a compatible format", "Rebuild the playback pipeline"],
    ],
  },
  {
    id: "subtitles",
    label: "Subtitles are missing or inaccurate",
    description: "Captions are missing, delayed, or incorrect.",
    diagnosis: [
      "The subtitle track is stale or no longer aligned with the video.",
      "The subtitle manifest remains inconsistent after reloading.",
    ],
    actions: [
      ["Reload the subtitle track", "Resynchronize subtitle timing"],
      ["Clear the subtitle cache", "Reload content with fresh captions"],
    ],
  },
  {
    id: "audio",
    label: "Audio is out of sync",
    description: "Voices and picture do not line up.",
    diagnosis: [
      "The audio track timing drifted from the video.",
      "The primary audio track still reports inconsistent timing.",
    ],
    actions: [
      ["Reload the audio track", "Align audio to the current frame"],
      ["Reload the content manifest", "Rebuild the playback pipeline"],
    ],
  },
  {
    id: "quality",
    label: "Picture quality is poor",
    description: "The picture looks blurry or unstable.",
    diagnosis: [
      "The player selected a profile below the available connection capacity.",
      "The quality estimate remains too conservative.",
    ],
    actions: [
      ["Clear the cached quality estimate", "Request a fresh quality profile"],
      ["Switch the delivery route", "Stabilize video quality"],
    ],
  },
  {
    id: "content_loading",
    label: "Content will not load",
    description: "The title stays on a loading screen.",
    diagnosis: [
      "The player has a stale content manifest or signed URL.",
      "The refreshed manifest still needs a new playback session.",
    ],
    actions: [
      ["Clear the content cache", "Request a new signed content URL"],
      ["Refresh playback authorization", "Reload the content"],
    ],
  },
];

export default function DemoPlayer({
  onRunUpdate,
  onOpenDashboard,
}: {
  onRunUpdate: (run: DemoRun) => void;
  onOpenDashboard: () => void;
}) {
  const [stage, setStage] = useState<Stage>("closed");
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [messages, setMessages] = useState<
    Array<{ from: "assistant" | "user"; title?: string; text: string; done?: boolean }>
  >([]);
  const [attempt, setAttempt] = useState(1);
  const runRef = useRef<DemoRun | null>(null);
  const startedAt = useRef(0);

  const openAssistant = () => {
    setStage("issues");
    setSelectedIssue(null);
    setAttempt(1);
    setMessages([
      {
        from: "assistant",
        title: "Hi, I can help with playback.",
        text: "What problem are you seeing?",
      },
    ]);
  };

  const chooseIssue = (issue: Issue) => {
    setSelectedIssue(issue);
    setStage("consent");
    setMessages([
      { from: "user", text: issue.label },
      {
        from: "assistant",
        title: "I found this viewing session.",
        text: "I can check the live playback signals and try reversible fixes while keeping your position.",
      },
      {
        from: "assistant",
        title: "Would you like me to try?",
        text: "I will not change your account or billing.",
      },
    ]);
  };

  const startRecovery = async (nextAttempt: number) => {
    if (!selectedIssue) return;
    const plan = await getPlan(selectedIssue, nextAttempt);
    const runId = runRef.current?.runId ?? `run_${Date.now()}`;
    if (nextAttempt === 1) startedAt.current = Date.now();

    setAttempt(nextAttempt);
    setStage("running");
    setMessages((current) => [
      ...current,
      {
        from: "user",
        text:
          nextAttempt === 1
            ? "Yes, try to fix it."
            : "No, it’s still happening.",
      },
    ]);

    const baseSteps: RunStep[] =
      nextAttempt === 1
        ? [
            {
              phase: "CONTEXT",
              title: "Session evidence collected",
              detail: "Joined player state, playback events, and service health.",
              owner: "system",
            },
            {
              phase: "POLICY",
              title: "Safe actions confirmed",
              detail: "Only reversible playback actions are allowed.",
              owner: "system",
            },
          ]
        : [
            ...(runRef.current?.steps ?? []),
            {
              phase: "FEEDBACK",
              title: "Viewer reports the issue persists",
              detail: "The first attempt was not marked resolved.",
              owner: "system",
            },
          ];

    const recoverySteps: RunStep[] = [
      {
        phase: nextAttempt === 1 ? "DIAGNOSE" : "REPLAN",
        title: plan.diagnosis,
        detail:
          nextAttempt === 1
            ? "Selected a recovery path from the allowed actions."
            : "Selected a different path using the viewer’s feedback.",
        owner: "agent",
      },
      ...plan.actions.map<RunStep>((action) => ({
        phase: "ACT",
        title: action.label,
        detail: "The typed playback tool completed successfully.",
        owner: "tool",
      })),
      {
        phase: "VERIFY",
        title: "Playback signal is healthy",
        detail: "Video is advancing and no new playback error was detected.",
        owner: "system",
      },
    ];

    const run: DemoRun = {
      runId,
      timestamp: new Date().toISOString(),
      status: "running",
      contentTitle: "Live Event · Demo Stream",
      sessionId: "ses_demo_8F21",
      issueLabel: selectedIssue.label,
      diagnosis: plan.diagnosis,
      steps: baseSteps,
      timeToRecoverSeconds: null,
      escalated: false,
      decisionSource: plan.source,
      model: plan.model,
    };
    runRef.current = run;
    onRunUpdate(run);

    const chatSteps = [
      {
        title: nextAttempt === 1 ? "I found the likely problem." : "I found another safe approach.",
        text: plan.diagnosis,
      },
      { title: "Applying a safe fix.", text: plan.actions[0].label },
      { title: "One more adjustment.", text: plan.actions[1].label },
      {
        title: "The playback signal looks healthy.",
        text: "Please check whether the original problem is gone.",
      },
    ];

    for (let index = 0; index < recoverySteps.length; index += 1) {
      await wait(650);
      const updated = {
        ...run,
        steps: [...baseSteps, ...recoverySteps.slice(0, index + 1)],
      };
      runRef.current = updated;
      onRunUpdate(updated);
      if (chatSteps[index]) {
        setMessages((current) => [
          ...current,
          { from: "assistant", ...chatSteps[index], done: true },
        ]);
      }
    }

    setStage("confirm");
  };

  const confirmResolved = () => {
    if (!runRef.current) return;
    const resolved: DemoRun = {
      ...runRef.current,
      status: "resolved",
      timeToRecoverSeconds: Math.max(
        1,
        Math.round((Date.now() - startedAt.current) / 1000),
      ),
      steps: [
        ...runRef.current.steps,
        {
          phase: "CONFIRM",
          title: "Viewer confirmed the issue is resolved",
          detail: "Healthy telemetry and viewer confirmation completed the run.",
          owner: "system",
        },
      ],
    };
    runRef.current = resolved;
    onRunUpdate(resolved);
    setMessages((current) => [
      ...current,
      { from: "user", text: "Yes, it’s fixed." },
      {
        from: "assistant",
        title: "You’re all set.",
        text: "Playback is healthy and your position was preserved.",
        done: true,
      },
    ]);
    setStage("resolved");
  };

  const confirmNotResolved = () => {
    if (attempt === 1) {
      void startRecovery(2);
      return;
    }
    if (!runRef.current) return;
    const handoff: DemoRun = {
      ...runRef.current,
      status: "feedback_only",
      escalated: true,
    };
    runRef.current = handoff;
    onRunUpdate(handoff);
    setMessages((current) => [
      ...current,
      { from: "user", text: "No, it’s still happening." },
      {
        from: "assistant",
        title: "I’m bringing in more help.",
        text: "I stopped after two safe attempts and prepared the complete trace for support.",
      },
    ]);
    setStage("handoff");
  };

  return (
    <section className="demo-player-shell">
      <div className="demo-video">
        <div className="demo-video-art">
          <span className="demo-live-badge">LIVE</span>
          <div className="demo-program">
            <small>DEMO STREAM</small>
            <h2>Championship Night</h2>
            <p>Live Event · 18:42 elapsed</p>
          </div>
          <div className="demo-play-mark">
            <Play size={34} fill="currentColor" />
          </div>
        </div>

        <div className="demo-player-controls">
          <button type="button" className="demo-round-control">
            <Play size={19} fill="currentColor" />
          </button>
          <Volume2 size={21} />
          <div className="demo-timeline">
            <span />
          </div>
          <small>18:42 / 43:00</small>
          <button type="button" className="demo-help-button" onClick={openAssistant}>
            <HelpCircle size={20} />
            Report playback issue
          </button>
        </div>
      </div>

      {stage !== "closed" && (
        <aside className="player-assistant">
          <div className="player-chat">
            {messages.map((message, index) => (
              <div className={`player-message ${message.from}`} key={`${message.text}-${index}`}>
                {message.from === "assistant" && (
                  <div className={`player-avatar ${message.done ? "done" : ""}`}>
                    {message.done ? <Check size={16} /> : <Sparkles size={16} />}
                  </div>
                )}
                <div className="player-bubble">
                  {message.title && <strong>{message.title}</strong>}
                  <p>{message.text}</p>
                </div>
              </div>
            ))}

            {stage === "issues" && (
              <div className="player-issue-list">
                {issues.map((issue) => (
                  <button type="button" key={issue.id} onClick={() => chooseIssue(issue)}>
                    <span>
                      <strong>{issue.label}</strong>
                      <small>{issue.description}</small>
                    </span>
                    <ChevronRight size={17} />
                  </button>
                ))}
              </div>
            )}

            {stage === "consent" && (
              <div className="player-chat-actions">
                <button type="button" className="primary" onClick={() => void startRecovery(1)}>
                  <ShieldCheck size={17} />
                  Yes, try to fix it
                </button>
                <button type="button" onClick={() => setStage("closed")}>
                  Not now
                </button>
              </div>
            )}

            {stage === "running" && (
              <div className="player-typing">
                <span />
                <span />
                <span />
              </div>
            )}

            {stage === "confirm" && (
              <div className="player-chat-actions">
                <button type="button" className="primary" onClick={confirmResolved}>
                  Yes, it’s fixed
                </button>
                <button type="button" onClick={confirmNotResolved}>
                  No, it’s still happening
                </button>
              </div>
            )}

            {(stage === "resolved" || stage === "handoff") && (
              <div className="player-chat-actions">
                <button type="button" className="primary" onClick={onOpenDashboard}>
                  View run in dashboard
                </button>
                <button type="button" onClick={() => setStage("closed")}>
                  Continue watching
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            className="player-close"
            onClick={() => setStage("closed")}
            aria-label="Close assistant"
          >
            ×
          </button>
        </aside>
      )}

      <div className="player-demo-note">
        <MessageCircle size={14} />
        Mock player and simulated playback signals
      </div>
    </section>
  );
}

async function getPlan(issue: Issue, attempt: number): Promise<AgentPlan> {
  try {
    const response = await fetch("/api/agent/decide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        issueId: issue.id,
        issueLabel: issue.label,
        attempt,
        userFeedback:
          attempt === 2 ? "The viewer says the first repair did not work." : null,
      }),
    });
    if (response.ok) return (await response.json()) as AgentPlan;
  } catch {
    // Use the local playbook below.
  }

  return {
    source: "fallback",
    model: null,
    diagnosis: issue.diagnosis[attempt - 1],
    actions: issue.actions[attempt - 1].map((label, index) => ({
      id: `local_action_${attempt}_${index}`,
      label,
    })),
  };
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
