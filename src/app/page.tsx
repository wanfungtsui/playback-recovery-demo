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
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
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
          <DemoPlayer apiKey={apiKey} onRunUpdate={setRemoteRun} />
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
              <strong>Demo TV Device</strong>
            </div>
            <div>
              <span>CONTENT</span>
              <strong>{remoteRun?.contentTitle ?? "Live · Demo Stream"}</strong>
            </div>
            <div>
              <span>REGION</span>
              <strong>Test Region</strong>
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

const designLayers = [
  {
    number: "01",
    title: "Experience layer",
    mode: "DETERMINISTIC",
    modeClass: "rules",
    icon: UserRound,
    purpose: "Capture the issue, explain the plan, request consent, and collect the outcome.",
    technology: "React conversation UI · typed issue taxonomy · session state",
  },
  {
    number: "02",
    title: "Context layer",
    mode: "PRECOMPUTED",
    modeClass: "rules",
    icon: Database,
    purpose: "Join playback events, device state, service health, and recent actions before the model runs.",
    technology: "Telemetry pipeline · session correlation · feature computation",
  },
  {
    number: "03",
    title: "Policy layer",
    mode: "DETERMINISTIC",
    modeClass: "rules",
    icon: ShieldCheck,
    purpose: "Enforce consent, safe-action allowlists, deadlines, attempt limits, and escalation rules.",
    technology: "Policy checks · action schema · two-attempt boundary",
  },
  {
    number: "04",
    title: "Decision layer",
    mode: "AGENT",
    modeClass: "agent",
    icon: Sparkles,
    purpose: "Diagnose ambiguous evidence and select the next safe path, including one replan after feedback.",
    technology: "LLM planner · structured JSON · validated playbook fallback",
  },
  {
    number: "05",
    title: "Execution layer",
    mode: "TYPED TOOLS",
    modeClass: "tools",
    icon: Wrench,
    purpose: "Run only reversible playback actions such as refreshing a session, track, route, or decoder.",
    technology: "Allowlisted tool adapters · normalized results · idempotent actions",
  },
  {
    number: "06",
    title: "Verification layer",
    mode: "HYBRID",
    modeClass: "hybrid",
    icon: Check,
    purpose: "Require healthy telemetry plus viewer confirmation before counting a resolution.",
    technology: "QoE thresholds · user feedback · aggregate evaluation agent",
  },
];

function AgentFramework() {
  return (
    <article className="framework-document">
      <header>
        <p className="eyebrow">AGENT FRAMEWORK</p>
        <h1>Playback Recovery Agent</h1>
        <p>
          A bounded agent that turns a playback issue report into a safe,
          observable, and verified recovery attempt.
        </p>
      </header>

      <section>
        <h2>1. Problem</h2>
        <p>
          Traditional “report an issue” flows create a support ticket but lose
          the live playback context. Support must ask the customer to reproduce
          the problem, and the eventual fix is difficult to measure.
        </p>
        <p>
          This agent captures the affected session immediately, applies
          reversible fixes with consent, and verifies success using both
          telemetry and customer confirmation. If two bounded attempts fail, it
          escalates with the complete trace.
        </p>
      </section>

      <section>
        <h2>2. Six-layer design</h2>
        <ol className="framework-layers">
        {designLayers.map((layer) => {
          return (
            <li key={layer.number}>
              <div>
                <strong>{layer.number} · {layer.title}</strong>
                <span>{layer.mode}</span>
              </div>
              <p>{layer.purpose}</p>
              <small>{layer.technology}</small>
            </li>
          );
        })}
        </ol>
      </section>

      <section>
        <h2>3. Model strategy</h2>
        <div className="model-levels">
          <div>
            <strong>Level 0 · No model</strong>
            <p>
              Session joins, policy checks, tool execution, and verification
              are deterministic. This is cheaper, faster, and auditable.
            </p>
          </div>
          <div>
            <strong>Level 1 · Lightweight model — demo default</strong>
            <p>
              <code>gpt-4o-mini</code> diagnoses the evidence and selects
              exactly two actions from an issue-specific allowlist. It also
              performs one replan after negative user feedback.
            </p>
          </div>
          <div>
            <strong>Level 2 · Advanced reasoning model — production option</strong>
            <p>
              Reserved for rare, ambiguous cases after the lightweight model
              cannot produce a valid plan. It is not required by this demo and
              should be gated by risk, latency, and cost policy.
            </p>
          </div>
        </div>
        <p>
          The provider model is configurable through <code>AGENT_MODEL</code>.
          Without an API key, the same interface uses a validated fallback
          playbook.
        </p>
      </section>

      <section>
        <h2>4. Boundaries and success criteria</h2>
        <ul>
          <li>Explicit customer consent before any repair.</li>
          <li>Only reversible, allowlisted playback actions.</li>
          <li>Maximum of two model decisions per recovery run.</li>
          <li>Schema validation before an action can execute.</li>
          <li>Success requires healthy telemetry and viewer confirmation.</li>
          <li>Failed bounded attempts escalate with a complete run trace.</li>
        </ul>
      </section>
    </article>
  );
}
