"use client";

import {
  Activity,
  Bot,
  Check,
  Clock3,
  Database,
  Eye,
  EyeOff,
  KeyRound,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  UserRound,
  Wrench,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import DemoPlayer, { type DemoRun, type RunStep } from "./DemoPlayer";

type RunState = "idle" | "running" | "resolved";

const steps: RunStep[] = [
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
  user: { label: "VIEWER", icon: UserRound },
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
  const [activeTab, setActiveTab] = useState<
    "player" | "operations" | "framework"
  >("player");
  const [runState, setRunState] = useState<RunState>("idle");
  const [visibleSteps, setVisibleSteps] = useState(0);
  const [remoteRun, setRemoteRun] = useState<DemoRun | null>(null);
  const [runHistory, setRunHistory] = useState<DemoRun[]>([]);
  const [runStorage, setRunStorage] = useState<"upstash" | "memory" | "loading">(
    "loading",
  );
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const persistenceQueue = useRef(Promise.resolve());

  const handleRunUpdate = (run: DemoRun) => {
    setRemoteRun(run);
    setRunHistory((current) => [
      run,
      ...current.filter((item) => item.runId !== run.runId),
    ].slice(0, 20));

    persistenceQueue.current = persistenceQueue.current
      .catch(() => undefined)
      .then(async () => {
        const response = await fetch("/api/agent-runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(run),
        });
        if (!response.ok) return;
        const result = (await response.json()) as {
          storage: "upstash" | "memory";
        };
        setRunStorage(result.storage);
      });
  };

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
    const loadRuns = async () => {
      try {
        const response = await fetch("/api/agent-runs?limit=20", {
          cache: "no-store",
        });
        if (!response.ok) return;
        const result = (await response.json()) as {
          runs: DemoRun[];
          storage: "upstash" | "memory";
        };
        setRunHistory(result.runs);
        setRunStorage(result.storage);
        if (result.runs[0]) setRemoteRun(result.runs[0]);
      } catch {
        setRunStorage("memory");
      }
    };
    void loadRuns();
  }, []);

  useEffect(() => {
    const loadEvaluation = async () => {
      try {
        const response = await fetch("/api/agent/evaluate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(apiKey ? { "x-demo-api-key": apiKey } : {}),
          },
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
  }, [apiKey]);

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
          <form
            className={`api-key-control ${apiKey ? "active" : ""}`}
            onSubmit={(event) => {
              event.preventDefault();
              setApiKey(apiKeyDraft.trim());
            }}
          >
            <KeyRound size={14} />
            <input
              type={showApiKey ? "text" : "password"}
              value={apiKeyDraft}
              onChange={(event) => setApiKeyDraft(event.target.value)}
              placeholder="OpenAI API key (session only)"
              aria-label="OpenAI API key"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              className="api-key-visibility"
              onClick={() => setShowApiKey((visible) => !visible)}
              aria-label={showApiKey ? "Hide API key" : "Show API key"}
            >
              {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            <button type="submit" className="api-key-apply">
              {apiKey ? "Applied" : "Apply"}
            </button>
          </form>
          <span className="environment">
            <span className="status-dot" />
            {apiKey ? "Live API ready" : "Fallback mode"}
          </span>
        </div>
      </header>

      <nav className="product-tabs" aria-label="Demo views">
        <button
          type="button"
          className={activeTab === "player" ? "active" : ""}
          onClick={() => setActiveTab("player")}
        >
          Player Demo
        </button>
        <button
          type="button"
          className={activeTab === "operations" ? "active" : ""}
          onClick={() => setActiveTab("operations")}
        >
          Operations
          {remoteRun && <span className="tab-run-dot" />}
        </button>
        <button
          type="button"
          className={activeTab === "framework" ? "active" : ""}
          onClick={() => setActiveTab("framework")}
        >
          Agent Framework
        </button>
      </nav>

      <section
        className={`tab-panel player-tab ${activeTab === "player" ? "active" : ""}`}
        aria-hidden={activeTab !== "player"}
      >
          <DemoPlayer apiKey={apiKey} onRunUpdate={handleRunUpdate} />
      </section>

      <div
        className={`tab-panel dashboard-tab ${activeTab === "operations" ? "active" : ""}`}
        aria-hidden={activeTab !== "operations"}
      >
        <section className="hero dashboard-title">
          <p className="eyebrow">OPERATIONS</p>
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
              <strong>{remoteRun?.device ?? "Demo TV Device"}</strong>
            </div>
            <div>
              <span>CONTENT</span>
              <strong>{remoteRun?.contentTitle ?? "Live · Demo Stream"}</strong>
            </div>
            <div>
              <span>REGION</span>
              <strong>{remoteRun?.region ?? "Test Region"}</strong>
            </div>
          </div>

          <div className="signal-list">
            {(remoteRun?.signals ?? [
              { label: "Fatal video errors", before: "3", healthy: "0", severity: "critical" as const },
              { label: "Video startup time", before: "8.7s", healthy: "1.3s", severity: "warning" as const },
              { label: "Rebuffering ratio", before: "14.2%", healthy: "0.4%", severity: "info" as const },
            ]).map((signal, index) => (
              <div
                className={`signal ${
                  activeRunState !== "resolved" && signal.severity === "critical"
                    ? "critical"
                    : ""
                }`}
                key={signal.label}
              >
                <div>
                  {index === 0 ? (
                    <TriangleAlert size={16} />
                  ) : index === 1 ? (
                    <Clock3 size={16} />
                  ) : (
                    <Activity size={16} />
                  )}
                  <span>{signal.label}</span>
                </div>
                <strong>
                  {activeRunState === "resolved" ? signal.healthy : signal.before}
                </strong>
              </div>
            ))}
          </div>

          <div className="evidence">
            <p className="section-label">CORRELATED EVIDENCE</p>
            <div>
              <Check size={14} />
              Error code: {remoteRun?.errorCode ?? "PLAYBACK_SESSION_EXPIRED"}
            </div>
            <div>
              <Check size={14} />
              {remoteRun?.steps.length ?? visibleSteps} recorded run events
            </div>
            <div>
              <Check size={14} />
              Last update:{" "}
              {remoteRun
                ? new Date(remoteRun.updatedAt).toLocaleTimeString()
                : "waiting for activity"}
            </div>
          </div>

          <div className="run-history">
            <div className="run-history-heading">
              <p className="section-label">RECENT RECOVERY RUNS</p>
              <span className={`storage-badge ${runStorage}`}>
                {runStorage === "upstash"
                  ? "UPSTASH"
                  : runStorage === "memory"
                    ? "MEMORY FALLBACK"
                    : "CONNECTING"}
              </span>
            </div>
            {runHistory.length === 0 ? (
              <p className="run-history-empty">No recorded runs yet.</p>
            ) : (
              runHistory.slice(0, 6).map((run) => (
                <button
                  type="button"
                  className={run.runId === remoteRun?.runId ? "active" : ""}
                  key={run.runId}
                  onClick={() => setRemoteRun(run)}
                >
                  <span>
                    <strong>{run.issueLabel}</strong>
                    <small>{run.runId}</small>
                  </span>
                  <span>
                    <strong>{formatRunStatus(run)}</strong>
                    <small>{new Date(run.updatedAt).toLocaleTimeString()}</small>
                  </span>
                </button>
              ))
            )}
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
                    {!remoteRun.diagnosis
                      ? "AWAITING DECISION"
                      : remoteRun.decisionSource === "api"
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
                    <div
                      className="timeline-step"
                      key={`${step.occurredAt ?? "static"}-${index}`}
                    >
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
                          <span>
                            {step.phase}
                            {step.attempt ? ` · ATTEMPT ${step.attempt}` : ""}
                            {step.latencyMs ? ` · ${step.latencyMs}ms` : ""}
                            {step.occurredAt
                              ? ` · ${new Date(step.occurredAt).toLocaleTimeString()}`
                              : ""}
                          </span>
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
      </div>

      <section
        className={`tab-panel framework-tab ${activeTab === "framework" ? "active" : ""}`}
        aria-hidden={activeTab !== "framework"}
      >
        <AgentFramework />
      </section>
    </main>
  );
}

function formatRunStatus(run: DemoRun) {
  if (run.status === "resolved") return "Resolved";
  if (run.escalated) return "Escalated";
  if (run.status === "feedback_only") return "No action";
  return "In progress";
}

const designLayers = [
  {
    number: "01",
    title: "Customer experience",
    mode: "NO AI",
    purpose:
      "Let the viewer describe the problem, understand the proposed repair, give permission, and confirm the result.",
    technology: "React interface · issue menu · in-session conversation",
  },
  {
    number: "02",
    title: "Session evidence",
    mode: "NO AI",
    purpose:
      "Collect what was happening in the player, device, and delivery services while the problem was still active.",
    technology: "Playback events · device details · service status",
  },
  {
    number: "03",
    title: "Safety controls",
    mode: "NO AI",
    purpose:
      "Decide what the agent is allowed to change, require customer consent, and stop after two attempts.",
    technology: "Permission rules · approved action list · escalation limits",
  },
  {
    number: "04",
    title: "Decision agent",
    mode: "AI MODEL",
    purpose:
      "Read the evidence and choose the best next step from the approved options. If the first repair fails, choose a different path.",
    technology: "gpt-4o-mini · structured response · fallback playbook",
  },
  {
    number: "05",
    title: "Recovery actions",
    mode: "NO AI",
    purpose:
      "Carry out the approved repair, such as refreshing playback, reloading subtitles, or switching the video route.",
    technology: "Approved API calls · predictable results · safe retries",
  },
  {
    number: "06",
    title: "Result check and learning",
    mode: "RULES + FEEDBACK",
    purpose:
      "Check that playback is healthy and ask the viewer whether the original problem is actually gone.",
    technology: "Playback health checks · viewer confirmation · operations reporting",
  },
];

function AgentFramework() {
  return (
    <article className="framework-document">
      <header>
        <p className="eyebrow">AGENT FRAMEWORK</p>
        <h1>Playback Recovery Agent</h1>
        <p>
          An AI-assisted troubleshooting flow that helps viewers recover from
          common playback problems without leaving the player or waiting for
          support.
        </p>
      </header>

      <section>
        <h2>Goal</h2>
        <p>
          A traditional feedback flow only records that something went wrong.
          Support receives the report later, after the useful session evidence
          may be gone, and must ask the viewer to repeat troubleshooting steps.
        </p>
        <p>
          This feature adds immediate troubleshooting inside the playback
          experience. It preserves the live context, suggests safe recovery
          steps, runs them with permission, and checks whether the problem was
          actually fixed.
        </p>
      </section>

      <section>
        <h2>User experience</h2>
        <p>When a viewer reports a playback issue, the assistant will:</p>
        <ol className="framework-steps">
          <li>Understand the selected issue and collect the current session evidence.</li>
          <li>Generate a short troubleshooting plan.</li>
          <li>Explain the likely cause in simple language.</li>
          <li>Ask whether the viewer wants the assistant to try the repair.</li>
          <li>Run each approved step and show the progress.</li>
          <li>Check the playback signals and ask whether the issue is fixed.</li>
          <li>Try one different plan, or escalate to support with the full history.</li>
        </ol>
      </section>

      <section>
        <h2>System design</h2>
        <p>
          The system is divided into six clear responsibilities. AI is used
          only to interpret the evidence and choose the next approved action.
          Everything that changes the player remains controlled by software
          rules.
        </p>
        <ol className="framework-layers">
        {designLayers.map((layer) => {
          return (
            <li key={layer.number}>
              <div>
                <strong>{layer.number} · {layer.title}</strong>
                <span>{layer.mode}</span>
              </div>
              <p>{layer.purpose}</p>
              <small>Built with: {layer.technology}</small>
            </li>
          );
        })}
        </ol>
      </section>

      <section>
        <h2>Supported recovery actions</h2>
        <p>
          The AI can only choose from actions already approved by the product
          and engineering teams. It cannot create a new command.
        </p>
        <ul className="supported-actions">
          <li>Refresh playback authorization</li>
          <li>Reload content at the saved position</li>
          <li>Switch to a healthier delivery route</li>
          <li>Request a fresh quality profile</li>
          <li>Reset the video decoder</li>
          <li>Switch to a compatible video format</li>
          <li>Reload or resynchronize subtitles</li>
          <li>Reload or resynchronize audio</li>
          <li>Renew the media license</li>
          <li>Clear stale content and request a new URL</li>
        </ul>
      </section>

      <section>
        <h2>AI model</h2>
        <p>
          <strong>Demo model:</strong> <code>gpt-4o-mini</code>
          <br />
          <strong>Model tier:</strong> small and fast
        </p>
        <p>This level is the right fit because it is:</p>
        <ul>
          <li>Fast enough for a conversation inside the player.</li>
          <li>Well suited to choosing from a short, fixed action list.</li>
          <li>Able to return a structured response that software can validate.</li>
          <li>Lower cost than a large reasoning model.</li>
        </ul>
        <p>
          A larger model is not needed for routine playback recovery. It should
          only be considered later if real outcome data shows that the small
          model cannot handle important complex cases. The model can be changed
          through <code>AGENT_MODEL</code>.
        </p>
      </section>

      <section>
        <h2>Prompt and response design</h2>
        <p>The model is instructed to:</p>
        <ul>
          <li>Act only as a playback recovery planner.</li>
          <li>Explain the likely cause in clear, customer-safe language.</li>
          <li>Select exactly two different actions from the provided list.</li>
          <li>Never suggest an action outside that list.</li>
          <li>Choose a different path when the first repair did not work.</li>
          <li>Return only structured data that the system can check.</li>
        </ul>
        <p>Expected response:</p>
        <pre className="framework-code">{`{
  "diagnosis": "The playback session may need fresh authorization.",
  "actionIds": ["refresh_playback_session", "reload_content"]
}`}</pre>
        <p>
          The system validates this response before running a tool. A correct
          sentence is not enough—the selected actions must also be approved for
          that specific issue.
        </p>
      </section>

      <section>
        <h2>Fallback design</h2>
        <p>
          The recovery experience does not stop when the AI service is missing
          or fails. The system automatically switches to a built-in recovery
          playbook for the selected playback problem.
        </p>
        <p>The fallback is used when:</p>
        <ul>
          <li>No API key has been provided.</li>
          <li>The model service times out or returns an error.</li>
          <li>The model response is incomplete or has the wrong format.</li>
          <li>The model selects an action that is not approved.</li>
        </ul>
        <p>
          The playbook uses the same safety rules and recovery tools as the AI
          path. It tries a predefined first repair, then a different second
          repair if needed. After two unsuccessful attempts, the case is sent
          to support. Operations clearly labels these runs as{" "}
          <strong>FALLBACK PLAYBOOK</strong>, so they are never presented as AI
          decisions.
        </p>
      </section>

      <section>
        <h2>Safety and success criteria</h2>
        <ul>
          <li>The customer must agree before a repair starts.</li>
          <li>The agent can only choose from approved, reversible actions.</li>
          <li>Each recovery run is limited to two AI decisions.</li>
          <li>The system checks every model response before doing anything.</li>
          <li>A run is successful only when playback is healthy and the viewer confirms the issue is gone.</li>
          <li>After two failed attempts, the case moves to support with the complete evidence and action history.</li>
        </ul>
      </section>

      <section>
        <h2>Product value</h2>
        <ul>
          <li>Give viewers useful help at the moment of frustration.</li>
          <li>Resolve some playback issues without opening a support ticket.</li>
          <li>Reduce repeated questions between viewers and support teams.</li>
          <li>Show operations exactly what the agent decided and changed.</li>
          <li>Measure which recovery actions improve verified outcomes.</li>
          <li>Give human support better evidence when automation cannot help.</li>
        </ul>
      </section>
    </article>
  );
}
