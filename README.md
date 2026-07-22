# Playback Recovery Agent

A working product demo that turns playback issue reporting into immediate,
bounded recovery.

**Live demo:** [https://playback-recovery-demo.vercel.app](https://playback-recovery-demo.vercel.app)

## Product goal

Most playback feedback flows stop after creating a support ticket. By the time
support responds, the affected session has ended, useful evidence is gone, and
the viewer may not be able to reproduce the problem.

This demo explores a better experience:

1. Capture the issue while it is happening.
2. Collect the current player and service signals.
3. Explain a short recovery plan and request permission.
4. Run only approved, reversible actions.
5. Verify playback health and ask the viewer to confirm the result.
6. Try one different plan if the first attempt fails.
7. Escalate with the complete run history when automation cannot help.

The outcome is not “the tool returned successfully.” A recovery only counts
when telemetry is healthy and the viewer confirms that the original issue is
gone.

## What is included

The application has three views.

### Player Demo

- Functional bundled demo video with playback controls.
- Seven issue types: buffering, stopped playback, green screen, subtitles,
  audio sync, picture quality, and content loading.
- Conversational troubleshooting inside the player.
- Explicit consent before a repair.
- A second, different recovery path after negative feedback.
- Human-support escalation after two unsuccessful attempts.

### Operations

- Live incident context and issue-specific synthetic telemetry.
- Error code, device, region, session ID, and playback signals.
- Timestamped viewer, system, agent, and tool events.
- Model source, attempt number, decision latency, and tool latency.
- Recent recovery history loaded from the server.
- Outcome analysis across a clearly labeled synthetic cohort.

### Agent Framework

- Product goal and customer flow.
- Six-part system design.
- Supported recovery actions.
- Model choice and prompt contract.
- Fallback behavior.
- Safety rules, success criteria, and product value.

## How the agent works

The design separates AI judgment from normal software behavior.

### 1. Customer experience — no AI

The interface captures the issue, explains the plan, requests consent, and
collects feedback.

### 2. Session evidence — no AI

The system collects playback events, device details, service status, and recent
actions before asking a model to decide anything.

### 3. Safety controls — no AI

Software rules enforce customer consent, approved actions, deadlines, the
two-attempt limit, and escalation.

### 4. Decision agent — AI model

The model reads the structured evidence, explains the likely cause, and selects
exactly two actions from the issue-specific approved list. On the second
attempt, actions used in the first attempt are excluded.

### 5. Recovery tools — no AI

Typed tool handlers execute approved actions such as refreshing playback,
reloading content, switching delivery routes, or resynchronizing tracks. The
model never calls an arbitrary API.

### 6. Verification and learning — rules plus feedback

The system checks playback health, asks the viewer whether the issue is fixed,
and records the verified outcome for operations analysis.

## Model choice

The demo defaults to `gpt-4o-mini`, a small and fast model.

It is appropriate for this task because:

- the decision space is a short, fixed action list;
- the response must be fast enough for an in-player conversation;
- structured JSON output can be validated before execution;
- a larger reasoning model would add cost and latency without clear value for
  routine cases.

The model is configurable through `AGENT_MODEL`. The architecture is not tied
to one provider, but the configured endpoint must support the OpenAI-compatible
chat-completions format used by this prototype.

The model receives issue context and an approved action list. It must return:

```json
{
  "diagnosis": "The playback session may need fresh authorization.",
  "actionIds": ["refresh_playback_session", "reload_content"]
}
```

The server rejects malformed responses, repeated actions, unknown actions, and
actions not approved for the selected issue.

## Fallback design

The product continues to work when AI is unavailable.

Fallback is used when:

- no API key is configured;
- the model request fails or times out;
- the response is not valid JSON;
- the response does not match the required structure;
- the model selects an unsupported action.

Each issue has two predefined recovery paths. The first path is used for the
initial attempt, and the second path is used only after the viewer says the
problem remains.

Operations labels the source as **LIVE API** or **FALLBACK PLAYBOOK**. Fallback
logic is never presented as an AI decision.

## Realistic demo data and run history

The telemetry is synthetic, but it is not one static scenario reused for every
issue. Each issue has a matching device, region, error code, and before/healthy
signal set. For example:

- buffering uses route failures, rebuffering ratio, and estimated bandwidth;
- subtitle issues use caption errors, timing drift, and cue coverage;
- green screen uses rendered frames, decoder errors, and media-clock state;
- content loading uses manifest errors, authorization status, and startup time.

Every meaningful recovery event is sent to:

```text
POST /api/agent-runs
```

Operations retrieves recent history from:

```text
GET /api/agent-runs
```

With Upstash configured, the latest 100 runs are retained for 30 days. Without
Upstash, the API uses a clearly labeled in-memory fallback for local
development. Memory mode is not durable across serverless restarts.

No API key or hidden model reasoning is stored in a run. The trace contains
only concise decision summaries, approved actions, results, timing, and viewer
feedback.

## Supported recovery actions

The model can only choose from issue-specific subsets of these actions:

- refresh playback authorization;
- reload content at the saved position;
- switch to a healthier delivery route;
- update the adaptive quality profile;
- reset the video decoder;
- switch to a compatible video format;
- reload or resynchronize subtitles;
- reload or resynchronize audio;
- renew the media license;
- clear stale content and request a new signed URL;
- rebuild the local playback pipeline.

## Safety boundaries

- Customer consent is required before execution.
- Only reversible, approved playback actions are available.
- The model chooses actions; deterministic code validates and executes them.
- Each run is limited to two model decisions.
- The second plan must use a different recovery path.
- Model requests have an eight-second timeout.
- Failed bounded attempts escalate with the complete trace.
- Success requires telemetry recovery and viewer confirmation.

## Technology

- Next.js App Router
- React and TypeScript
- Next.js route handlers
- OpenAI-compatible chat-completions API
- Upstash Redis through `@upstash/redis`
- Lucide icons
- Vercel deployment

## Run locally

Requirements:

- Node.js 20 or newer
- npm

```bash
git clone https://github.com/wanfungtsui/playback-recovery-demo.git
cd playback-recovery-demo
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The application works without credentials. It uses the fallback playbook and
in-memory run storage by default.

## Environment variables

```bash
# Optional real model
AGENT_API_KEY=
AGENT_API_URL=https://api.openai.com/v1/chat/completions
AGENT_MODEL=gpt-4o-mini

# Optional durable run history
KV_REST_API_URL=
KV_REST_API_TOKEN=
```

For interview use, a temporary OpenAI API key can also be entered in the page
header. It remains in page memory and is sent to the same-origin Next.js API.
It is not persisted by the application. Because browser developer tools and
hosting infrastructure can observe requests, use a restricted temporary key
and revoke it after the demo.

## Upstash on Vercel

Connect an Upstash Redis resource to the Vercel project through the Vercel
Marketplace, or use the Vercel CLI:

```bash
vercel integration add upstash/upstash-kv \
  --name playback-recovery-runs \
  --plan free \
  -m primaryRegion=iad1 \
  -m autoUpgrade=false
```

The integration injects the Redis REST environment variables into the linked
project. Redeploy after connecting the resource.

## Quality checks

```bash
npm run typecheck
npm run lint
npm run build
```

## Deployment

The project requires a Next.js server runtime because it contains API routes.
It cannot run as a complete application on static GitHub Pages.

```bash
npx vercel --prod
```

Production URL:

[https://playback-recovery-demo.vercel.app](https://playback-recovery-demo.vercel.app)

## Prototype scope

This repository is an interview-ready product prototype, not a production
playback control system.

Current demo:

- synthetic issue-specific telemetry;
- simulated playback tools;
- Redis-backed run history when configured;
- optional real model planning;
- validated deterministic fallback.

A production version would require authenticated telemetry access, tenant
isolation, encrypted secrets, rate limiting, durable workflow orchestration,
tool authorization, data-retention controls, and formal model evaluation.

All users, sessions, telemetry, and outcomes shown by the demo are fictional.

## License

[MIT](LICENSE)

The bundled flower video is the CC0 sample published by MDN Web Docs.
