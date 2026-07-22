"use client";

import {
  ChevronRight,
  HelpCircle,
  MessageCircle,
  Pause,
  Play,
  ShieldCheck,
  Volume2,
  VolumeX,
} from "lucide-react";
import { type CSSProperties, useRef, useState } from "react";

export type RunStep = {
  phase: string;
  title: string;
  detail: string;
  owner: "user" | "system" | "agent" | "tool";
  occurredAt?: string;
  attempt?: number;
  latencyMs?: number;
};

export type RunSignal = {
  label: string;
  before: string;
  healthy: string;
  severity: "critical" | "warning" | "info";
};

export type DemoRun = {
  runId: string;
  timestamp: string;
  updatedAt: string;
  status: "running" | "resolved" | "feedback_only";
  issueId: string;
  contentTitle: string;
  sessionId: string;
  device: string;
  region: string;
  errorCode: string;
  issueLabel: string;
  diagnosis: string | null;
  steps: RunStep[];
  signals: RunSignal[];
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

const scenarios: Record<
  string,
  {
    device: string;
    region: string;
    errorCode: string;
    signals: RunSignal[];
  }
> = {
  buffering: {
    device: "Demo TV · Wi-Fi",
    region: "US West",
    errorCode: "DELIVERY_ROUTE_DEGRADED",
    signals: [
      { label: "Route failures", before: "12", healthy: "0", severity: "critical" },
      { label: "Rebuffering ratio", before: "14.2%", healthy: "0.4%", severity: "warning" },
      { label: "Estimated bandwidth", before: "2.1 Mbps", healthy: "18.6 Mbps", severity: "info" },
    ],
  },
  stopped: {
    device: "Demo TV Device",
    region: "US West",
    errorCode: "PLAYBACK_SESSION_EXPIRED",
    signals: [
      { label: "Fatal video errors", before: "3", healthy: "0", severity: "critical" },
      { label: "Session authorization", before: "Expired", healthy: "Valid", severity: "warning" },
      { label: "Video startup time", before: "8.7s", healthy: "1.3s", severity: "info" },
    ],
  },
  green_screen: {
    device: "Demo Mobile · Android",
    region: "US Central",
    errorCode: "VIDEO_DECODER_OUTPUT_INVALID",
    signals: [
      { label: "Rendered video frames", before: "0 fps", healthy: "60 fps", severity: "critical" },
      { label: "Decoder errors", before: "18", healthy: "0", severity: "warning" },
      { label: "Audio/video clock", before: "Video stalled", healthy: "Synchronized", severity: "info" },
    ],
  },
  subtitles: {
    device: "Demo Web Browser",
    region: "US East",
    errorCode: "CAPTION_TRACK_OUT_OF_SYNC",
    signals: [
      { label: "Caption load errors", before: "7", healthy: "0", severity: "critical" },
      { label: "Subtitle timing drift", before: "2.8s", healthy: "0.1s", severity: "warning" },
      { label: "Caption cue coverage", before: "62%", healthy: "100%", severity: "info" },
    ],
  },
  audio: {
    device: "Demo Tablet · iOS",
    region: "Europe West",
    errorCode: "AUDIO_TIMESTAMP_DRIFT",
    signals: [
      { label: "Audio/video drift", before: "1.9s", healthy: "0.08s", severity: "critical" },
      { label: "Audio discontinuities", before: "11", healthy: "0", severity: "warning" },
      { label: "Audio buffer health", before: "Unstable", healthy: "Healthy", severity: "info" },
    ],
  },
  quality: {
    device: "Demo TV · Ethernet",
    region: "Asia Pacific",
    errorCode: "QUALITY_ESTIMATE_STALE",
    signals: [
      { label: "Selected resolution", before: "480p", healthy: "1080p", severity: "critical" },
      { label: "Available bandwidth", before: "16.4 Mbps", healthy: "16.8 Mbps", severity: "info" },
      { label: "Unexpected quality drops", before: "9", healthy: "0", severity: "warning" },
    ],
  },
  content_loading: {
    device: "Demo Web Browser",
    region: "US East",
    errorCode: "MANIFEST_URL_EXPIRED",
    signals: [
      { label: "Manifest request errors", before: "5", healthy: "0", severity: "critical" },
      { label: "Content authorization", before: "HTTP 403", healthy: "HTTP 200", severity: "warning" },
      { label: "Video startup time", before: ">12s", healthy: "1.5s", severity: "info" },
    ],
  },
};

export default function DemoPlayer({
  apiKey,
  onRunUpdate,
}: {
  apiKey: string;
  onRunUpdate: (run: DemoRun) => void;
}) {
  const [stage, setStage] = useState<Stage>("closed");
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [messages, setMessages] = useState<
    Array<{ from: "assistant" | "user"; title?: string; text: string }>
  >([]);
  const [attempt, setAttempt] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const runRef = useRef<DemoRun | null>(null);
  const startedAt = useRef(0);

  const togglePlayback = async () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      await video.play();
    } else {
      video.pause();
    }
  };

  const toggleMuted = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  const openAssistant = () => {
    setStage("issues");
    setSelectedIssue(null);
    setAttempt(1);
    runRef.current = null;
    setMessages([
      {
        from: "assistant",
        title: "Hi, I can help with playback.",
        text: "What problem are you seeing?",
      },
    ]);
  };

  const chooseIssue = (issue: Issue) => {
    const now = new Date().toISOString();
    const runSuffix = now.replace(/\D/g, "").slice(-12);
    const scenario = scenarios[issue.id];
    const run: DemoRun = {
      runId: `run_${runSuffix}`,
      timestamp: now,
      updatedAt: now,
      status: "running",
      issueId: issue.id,
      contentTitle: "Nature in Motion · Demo Video",
      sessionId: `ses_demo_${runSuffix.slice(-6)}`,
      device: scenario.device,
      region: scenario.region,
      errorCode: scenario.errorCode,
      issueLabel: issue.label,
      diagnosis: null,
      steps: [
        {
          phase: "REPORT",
          title: "Viewer reported a playback issue",
          detail: issue.label,
          owner: "user",
          occurredAt: now,
        },
        {
          phase: "CONTEXT",
          title: "Affected playback session matched",
          detail: `Captured ${scenario.errorCode} with ${scenario.signals.length} supporting signals.`,
          owner: "system",
          occurredAt: now,
        },
      ],
      signals: scenario.signals,
      timeToRecoverSeconds: null,
      escalated: false,
      decisionSource: "fallback",
      model: null,
    };
    runRef.current = run;
    onRunUpdate(run);
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
    if (!selectedIssue || !runRef.current) return;
    if (nextAttempt === 1) startedAt.current = new Date().getTime();

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

    const now = new Date().toISOString();
    const prePlanStep: RunStep =
      nextAttempt === 1
        ? {
            phase: "CONSENT",
            title: "Viewer approved safe recovery",
            detail: "Permission applies only to reversible playback actions.",
            owner: "user",
            occurredAt: now,
            attempt: nextAttempt,
          }
        : {
            phase: "FEEDBACK",
            title: "Viewer reported the issue still occurs",
            detail: "The first recovery path was not marked resolved.",
            owner: "user",
            occurredAt: now,
            attempt: nextAttempt,
          };
    const policyStep: RunStep = {
      phase: "POLICY",
      title: "Recovery policy approved the request",
      detail: "Action allowlist, consent, deadline, and attempt limit passed.",
      owner: "system",
      occurredAt: now,
      attempt: nextAttempt,
    };
    let currentRun: DemoRun = {
      ...runRef.current,
      updatedAt: now,
      steps: [...runRef.current.steps, prePlanStep, policyStep],
    };
    runRef.current = currentRun;
    onRunUpdate(currentRun);

    const decisionStartedAt = new Date().getTime();
    const plan = await getPlan(selectedIssue, nextAttempt, apiKey);
    const decisionLatencyMs = new Date().getTime() - decisionStartedAt;
    const recoverySteps: Omit<RunStep, "occurredAt">[] = [
      {
        phase: nextAttempt === 1 ? "DIAGNOSE" : "REPLAN",
        title: plan.diagnosis,
        detail:
          nextAttempt === 1
            ? "Selected a recovery path from the allowed actions."
            : "Selected a different path using the viewer’s feedback.",
        owner: "agent",
        attempt: nextAttempt,
        latencyMs: decisionLatencyMs,
      },
      ...plan.actions.map<Omit<RunStep, "occurredAt">>((action, index) => ({
        phase: "ACT",
        title: action.label,
        detail: "Approved playback tool completed successfully.",
        owner: "tool",
        attempt: nextAttempt,
        latencyMs: 180 + index * 70,
      })),
      {
        phase: "VERIFY",
        title: "Playback signal is healthy",
        detail: "Video is advancing and no new playback error was detected.",
        owner: "system",
        attempt: nextAttempt,
        latencyMs: 650,
      },
    ];

    currentRun = {
      ...currentRun,
      diagnosis: plan.diagnosis,
      decisionSource: plan.source,
      model: plan.model,
      updatedAt: new Date().toISOString(),
    };
    runRef.current = currentRun;

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

    for (const [index, recoveryStep] of recoverySteps.entries()) {
      await wait(650);
      const completedAt = new Date().toISOString();
      const completedStep: RunStep = {
        ...recoveryStep,
        occurredAt: completedAt,
      };
      currentRun = {
        ...currentRun,
        updatedAt: completedAt,
        steps: [...currentRun.steps, completedStep],
      };
      runRef.current = currentRun;
      onRunUpdate(currentRun);
      if (chatSteps[index]) {
        setMessages((current) => [
          ...current,
          { from: "assistant", ...chatSteps[index] },
        ]);
      }
    }

    setStage("confirm");
  };

  const confirmResolved = () => {
    if (!runRef.current) return;
    const now = new Date().toISOString();
    const resolved: DemoRun = {
      ...runRef.current,
      updatedAt: now,
      status: "resolved",
      timeToRecoverSeconds: Math.max(
        1,
        Math.round((new Date().getTime() - startedAt.current) / 1000),
      ),
      steps: [
        ...runRef.current.steps,
        {
          phase: "CONFIRM",
          title: "Viewer confirmed the issue is resolved",
          detail: "The original playback problem is no longer visible.",
          owner: "user",
          occurredAt: now,
          attempt,
        },
        {
          phase: "OUTCOME",
          title: "Recovery marked as verified",
          detail: "Healthy playback signals and viewer confirmation completed the run.",
          owner: "system",
          occurredAt: now,
          attempt,
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
    const now = new Date().toISOString();
    const handoff: DemoRun = {
      ...runRef.current,
      updatedAt: now,
      status: "feedback_only",
      escalated: true,
      steps: [
        ...runRef.current.steps,
        {
          phase: "CONFIRM",
          title: "Viewer reported the issue still occurs",
          detail: "The second recovery attempt did not solve the original problem.",
          owner: "user",
          occurredAt: now,
          attempt,
        },
        {
          phase: "ESCALATE",
          title: "Case prepared for human support",
          detail: "Session evidence, model decisions, and tool results were attached.",
          owner: "system",
          occurredAt: now,
          attempt,
        },
      ],
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

  const declineRecovery = () => {
    if (!runRef.current) {
      setStage("closed");
      return;
    }
    const now = new Date().toISOString();
    const declined: DemoRun = {
      ...runRef.current,
      updatedAt: now,
      status: "feedback_only",
      steps: [
        ...runRef.current.steps,
        {
          phase: "CONSENT",
          title: "Viewer declined automated recovery",
          detail: "No playback action was executed.",
          owner: "user",
          occurredAt: now,
        },
      ],
    };
    runRef.current = declined;
    onRunUpdate(declined);
    setStage("closed");
  };

  return (
    <section className="demo-player-shell">
      <div className="demo-video">
        <div className="demo-video-art">
          <video
            ref={videoRef}
            src="/demo-video.mp4"
            preload="metadata"
            playsInline
            loop
            muted={isMuted}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
            onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
            onClick={() => void togglePlayback()}
          />
          <span className="demo-live-badge">DEMO VIDEO</span>
          <div className="demo-program">
            <small>PLAYBACK EXPERIENCE</small>
            <h2>Nature in Motion</h2>
            <p>Bundled CC0 demo video</p>
          </div>
        </div>

        <div className="demo-player-controls">
          <button
            type="button"
            className="demo-round-control"
            onClick={() => void togglePlayback()}
            aria-label={isPlaying ? "Pause demo video" : "Play demo video"}
          >
            {isPlaying ? (
              <Pause size={19} fill="currentColor" />
            ) : (
              <Play size={19} fill="currentColor" />
            )}
          </button>
          <button
            type="button"
            className="demo-volume-control"
            onClick={toggleMuted}
            aria-label={isMuted ? "Unmute demo video" : "Mute demo video"}
          >
            {isMuted ? <VolumeX size={21} /> : <Volume2 size={21} />}
          </button>
          <input
            className="demo-timeline"
            type="range"
            min="0"
            max={duration || 0}
            step="0.1"
            value={Math.min(currentTime, duration || 0)}
            onChange={(event) => {
              const nextTime = Number(event.target.value);
              if (videoRef.current) videoRef.current.currentTime = nextTime;
              setCurrentTime(nextTime);
            }}
            aria-label="Video progress"
            style={{
              "--video-progress": `${duration ? (currentTime / duration) * 100 : 0}%`,
            } as CSSProperties}
          />
          <small>{formatTime(currentTime)} / {formatTime(duration)}</small>
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
                <button type="button" onClick={declineRecovery}>
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
              <div className="player-chat-actions single">
                <button type="button" className="primary" onClick={() => setStage("closed")}>
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

async function getPlan(
  issue: Issue,
  attempt: number,
  apiKey: string,
): Promise<AgentPlan> {
  try {
    const response = await fetch("/api/agent/decide", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { "x-demo-api-key": apiKey } : {}),
      },
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

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}
