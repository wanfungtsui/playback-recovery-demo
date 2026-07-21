"use client";

import {
  Activity,
  Bot,
  Check,
  Clock3,
  Database,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  UserRound,
  Wrench,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type RunState = "idle" | "running" | "resolved";

type Step = {
  phase: string;
  title: string;
  detail: string;
  owner: "system" | "agent" | "tool";
};

type RemoteRun = {
  runId: string;
  timestamp: string;
  status: "running" | "resolved" | "feedback_only";
  contentTitle: string;
  sessionId: string;
  issueLabel: string;
  diagnosis: string | null;
  steps: Step[];
  timeToRecoverSeconds: number | null;
  escalated: boolean;
  decisionSource?: "api" | "fallback" | "local_fallback";
  model?: string | null;
  fallbackReason?: string | null;
};

const steps: Step[] = [
  {
    phase: "CONTEXT",
    title: "Session evidence hydrated",
    detail:
      "Joined player telemetry, service health, device profile, and recent account events.",
    owner: "system",
  },
  {
    phase: "POLICY",
    title: "Safe-action policy evaluated",
    detail:
      "User consent is active. Session refresh and local player restart are pre-approved, reversible actions.",
    owner: "system",
  },
  {
    phase: "DIAGNOSE",
    title: "Expired playback authorization identified",
    detail:
      "VIDEO-403 began after the manifest token expired. CDN and origin health remain normal.",
    owner: "agent",
  },
  {
    phase: "ACT",
    title: "Playback session refreshed",
    detail:
      "POST /v1/playback/sessions/refresh returned 200. A new signed manifest is available.",
    owner: "tool",
  },
  {
    phase: "ACT",
    title: "Player restarted at saved position",
    detail:
      "Playback engine restarted at 00:18:42 with captions and quality preferences preserved.",
    owner: "tool",
  },
  {
    phase: "VERIFY",
    title: "Recovery confirmed from telemetry",
    detail:
      "Video is advancing, fatal errors cleared, and rebuffering is below the recovery threshold for 15 seconds.",
    owner: "system",
  },
];

const ownerMeta = {
  system: { label: "DETERMINISTIC", icon: Database },
  agent: { label: "AGENT", icon: Sparkles },
  tool: { label: "TOOL", icon: Wrench },
};

const caseMetrics = [
  { id: "green_screen", label: "Green screen", sampleSize: 146, agentSuccessRate: 0.84, rulesSuccessRate: 0.53 },
  { id: "subtitles", label: "Subtitle issues", sampleSize: 238, agentSuccessRate: 0.91, rulesSuccessRate: 0.67 },
  { id: "content_loading", label: "Content not loading", sampleSize: 194, agentSuccessRate: 0.79, rulesSuccessRate: 0.61 },
  { id: "audio", label: "Audio out of sync", sampleSize: 127, agentSuccessRate: 0.73, rulesSuccessRate: 0.56 },
  { id: "buffering", label: "Buffering", sampleSize: 321, agentSuccessRate: 0.76, rulesSuccessRate: 0.67 },
  { id: "quality", label: "Poor picture quality", sampleSize: 222, agentSuccessRate: 0.69, rulesSuccessRate: 0.65 },
];

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

export default function Home() {
  const [runState, setRunState] = useState<RunState>("idle");
  const [visibleSteps, setVisibleSteps] = useState(0);
  const [remoteRun, setRemoteRun] = useState<RemoteRun | null>(null);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const reset = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setRunState("idle");
    setVisibleSteps(0);
  };

  const startRun = () => {
    reset();
    setRunState("running");
    steps.forEach((_, index) => {
      const timer = setTimeout(() => {
        setVisibleSteps(index + 1);
        if (index === steps.length - 1) setRunState("resolved");
      }, 550 + index * 850);
      timers.current.push(timer);
    });
  };

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useEffect(() => {
    let active = true;

    const loadLatestRun = async () => {
      try {
        const response = await fetch("/api/agent-runs", { cache: "no-store" });
        const data = (await response.json()) as { runs?: RemoteRun[] };
        if (active) setRemoteRun(data.runs?.[0] ?? null);
      } catch {
        // The built-in scenario remains available if the local event API is offline.
      }
    };

    void loadLatestRun();
    const interval = window.setInterval(loadLatestRun, 1000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const loadEvaluation = async () => {
      try {
        const response = await fetch("/api/agent/evaluate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cases: caseMetrics }),
        });
        if (response.ok) {
          setEvaluation((await response.json()) as Evaluation);
        }
      } catch {
        // The table remains useful if the optional evaluation service is offline.
      }
    };

    void loadEvaluation();
  }, []);

  const activeRunState: RunState = remoteRun
    ? remoteRun.status === "running"
      ? "running"
      : "resolved"
    : runState;
  const activeSteps = remoteRun?.steps?.length
    ? remoteRun.steps
    : steps.slice(0, visibleSteps);

  const progress = useMemo(
    () =>
      activeRunState === "resolved"
        ? 100
        : Math.min(95, Math.round((activeSteps.length / steps.length) * 100)),
    [activeRunState, activeSteps.length],
  );

  return (
    <main>
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <Activity size={18} />
          </div>
          <span>Playback Recovery</span>
          <span className="prototype-badge">PRODUCT CONCEPT</span>
          <span className="mock-badge">MOCK DATA</span>
        </div>
        <div className="header-actions">
          <span className="environment">
            <span className="status-dot" />
            Simulated environment
          </span>
        </div>
      </header>

      <section className="hero dashboard-title">
        <h1>Playback issue dashboard</h1>
      </section>

      <section className="workspace">
        <aside className="incident-panel">
          <div className="panel-heading">
            <div>
              <p className="section-label">ACTIVE INCIDENT</p>
              <h2>{remoteRun?.issueLabel ?? "Playback stops after 18 min"}</h2>
            </div>
            <span className={`incident-status ${activeRunState}`}>
              {activeRunState === "resolved" ? "Resolved" : "Open"}
            </span>
          </div>

          <div className="customer-message">
            <UserRound size={17} />
            <p>
              “
              {remoteRun
                ? `I’m reporting: ${remoteRun.issueLabel}. Please help me fix it.`
                : "The game keeps stopping and sending me back to the loading screen. Please fix it."}
              ”
            </p>
          </div>

          <div className="session-grid">
            <div>
              <span>SESSION</span>
              <strong>{remoteRun?.sessionId ?? "ses_8F21A9"}</strong>
            </div>
            <div>
              <span>DEVICE</span>
              <strong>Roku Ultra</strong>
            </div>
            <div>
              <span>CONTENT</span>
              <strong>{remoteRun?.contentTitle ?? "Live · SF vs. LA"}</strong>
            </div>
            <div>
              <span>REGION</span>
              <strong>US West</strong>
            </div>
          </div>

          <div className="signal-list">
            <div className="signal critical">
              <div>
                <TriangleAlert size={16} />
                <span>Fatal video errors</span>
              </div>
              <strong>{activeRunState === "resolved" ? "0" : "3"}</strong>
            </div>
            <div className="signal">
              <div>
                <Clock3 size={16} />
                <span>Video startup time</span>
              </div>
              <strong>{activeRunState === "resolved" ? "1.3s" : "8.7s"}</strong>
            </div>
            <div className="signal">
              <div>
                <Activity size={16} />
                <span>Rebuffering ratio</span>
              </div>
              <strong>{activeRunState === "resolved" ? "0.4%" : "14.2%"}</strong>
            </div>
          </div>

          <div className="evidence">
            <p className="section-label">CORRELATED EVIDENCE</p>
            <div>
              <Check size={14} />
              CDN and origin operating normally
            </div>
            <div>
              <Check size={14} />
              Error starts at token expiry timestamp
            </div>
            <div>
              <Check size={14} />
              12 similar sessions recovered by refresh
            </div>
          </div>
        </aside>

        <section className="agent-panel">
          <div className="panel-heading agent-heading">
            <div>
              <p className="section-label">
                {remoteRun ? "LIVE PLAYER RUN" : "AGENT RUN"}
              </p>
              <h2>{remoteRun ? remoteRun.issueLabel : "Resolve playback incident"}</h2>
            </div>
            {remoteRun && (
              <div className="run-controls">
                <div className={`decision-source ${remoteRun.decisionSource ?? "fallback"}`}>
                  <Sparkles size={14} />
                  <span>
                    {remoteRun.decisionSource === "api"
                      ? `LIVE API · ${remoteRun.model ?? "MODEL"}`
                      : "FALLBACK PLAYBOOK"}
                  </span>
                </div>
              </div>
            )}
          </div>

          {activeRunState === "idle" ? (
            <div className="ready-state">
              <div className="agent-orb">
                <Bot size={28} />
              </div>
              <h3>Evidence is ready for diagnosis</h3>
              <p>
                The deterministic pipeline has already assembled the session
                context. Start the agent to choose and verify the next best
                action.
              </p>
              <button className="primary-button" onClick={startRun}>
                <Play size={16} fill="currentColor" />
                Run recovery agent
              </button>
              <div className="guardrails">
                <span>
                  <ShieldCheck size={14} /> Low-risk actions only
                </span>
                <span>2 LLM calls max</span>
                <span>60s deadline</span>
              </div>
            </div>
          ) : (
            <div className="run-view">
              <div className="progress-row">
                <div className="progress-track">
                  <div
                    className="progress-bar"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span>{activeRunState === "resolved" ? "Complete" : `${progress}%`}</span>
              </div>

              <div className="timeline">
                {activeSteps.map((step, index) => {
                  const meta = ownerMeta[step.owner];
                  const Icon = meta.icon;
                  const ownerLabel =
                    step.owner === "agent" &&
                    remoteRun &&
                    remoteRun.decisionSource !== "api"
                      ? "PLAYBOOK"
                      : meta.label;
                  return (
                    <div className="timeline-step" key={step.title}>
                      <div className={`step-marker ${step.owner}`}>
                        {index < activeSteps.length - 1 || activeRunState === "resolved" ? (
                          <Check size={13} />
                        ) : (
                          <RefreshCw size={13} className="spin" />
                        )}
                      </div>
                      <div className="step-content">
                        <div className="step-meta">
                          <span className={`owner ${step.owner}`}>
                            <Icon size={11} />
                            {ownerLabel}
                          </span>
                          <span>{step.phase}</span>
                        </div>
                        <h3>{step.title}</h3>
                        <p>{step.detail}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {activeRunState === "resolved" && (
                <div className="outcome">
                  <div className="outcome-icon">
                    <Check size={18} />
                  </div>
                  <div>
                    <span>
                      {remoteRun?.status === "feedback_only"
                        ? "FEEDBACK RECORDED"
                        : "OUTCOME VERIFIED"}
                    </span>
                    <strong>
                      {remoteRun
                        ? remoteRun.status === "feedback_only"
                          ? remoteRun.escalated
                            ? "Escalated with complete recovery trace"
                            : "Feedback captured with session evidence"
                          : `${remoteRun.contentTitle} playback restored`
                        : "Playback restored at 00:18:42"}
                    </strong>
                    <p>
                      {remoteRun?.status === "feedback_only"
                        ? remoteRun.escalated
                          ? "User still affected · bounded attempts exhausted"
                          : "No autonomous action requested · ready for support review"
                        : `Resolved autonomously in ${
                            remoteRun?.timeToRecoverSeconds ?? 42
                          } seconds · no escalation`}
                    </p>
                  </div>
                  {!remoteRun && (
                    <button className="icon-button" onClick={reset} title="Reset demo">
                      <RefreshCw size={16} />
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      </section>

      <section className="analytics">
        <div className="evaluation-heading">
          <div>
            <p className="eyebrow">EVALUATION AGENT</p>
            <h2>Where does the recovery agent work?</h2>
          </div>
          <div className={`evaluation-source ${evaluation?.source ?? "fallback"}`}>
            <Sparkles size={14} />
            {evaluation?.source === "api"
              ? `LIVE API · ${evaluation.model ?? "MODEL"}`
              : "FALLBACK ANALYSIS"}
          </div>
        </div>

        <div className="evaluation-summary">
          <div className="evaluation-agent-icon">
            <Bot size={22} />
          </div>
          <div>
            <span>AGENT ANALYSIS</span>
            <h3>
              {evaluation?.headline ??
                "Analyzing verified outcomes by playback issue"}
            </h3>
            <p>
              {evaluation?.summary ??
                "Comparing agent recovery with deterministic playbooks."}
            </p>
          </div>
        </div>

        <div className="case-table">
          <div className="case-table-header">
            <span>Playback case</span>
            <span>Sample</span>
            <span>Agent success</span>
            <span>Rules baseline</span>
            <span>Lift</span>
            <span>Recommendation</span>
          </div>
          {caseMetrics.map((item) => {
            const recommendation = evaluation?.recommendations.find(
              (entry) => entry.caseId === item.id,
            );
            const lift = item.agentSuccessRate - item.rulesSuccessRate;
            const defaultMode =
              lift >= 0.15 ? "agent" : lift >= 0.06 ? "hybrid" : "rules";
            const mode = recommendation?.mode ?? defaultMode;

            return (
              <div className="case-row" key={item.id}>
                <div className="case-name">
                  <strong>{item.label}</strong>
                  <small>{recommendation?.rationale ?? "Analysis pending"}</small>
                </div>
                <span>{item.sampleSize}</span>
                <strong className="agent-rate">
                  {Math.round(item.agentSuccessRate * 100)}%
                </strong>
                <span>{Math.round(item.rulesSuccessRate * 100)}%</span>
                <strong className={lift >= 0.1 ? "high-lift" : "low-lift"}>
                  +{Math.round(lift * 100)} pts
                </strong>
                <span className={`mode-badge ${mode}`}>
                  {mode === "agent"
                    ? "Use agent"
                    : mode === "hybrid"
                      ? "Hybrid"
                      : "Rules first"}
                </span>
              </div>
            );
          })}
        </div>

        <div className="evaluation-footnote">
          <span>Synthetic 30-day cohort · 1,248 playback incidents</span>
          <span>
            Success = healthy telemetry + viewer confirmation
          </span>
        </div>
      </section>

      <footer>
        <span>Playback Recovery Agent · Product prototype</span>
        <span>Built to explore closed-loop digital experience optimization</span>
      </footer>
    </main>
  );
}
