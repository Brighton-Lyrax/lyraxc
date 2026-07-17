# Lyraxc

> An autonomous agent that performs **human-like actions** in a real browser from
> plain-language instructions.

Lyraxc is inspired by "computer-use"/browser agents but focuses on **realistic,
human-like interaction**: curved mouse movement, variable typing cadence,
think-time pauses and smooth scrolling. Give it a goal in natural language and it
plans and executes browser actions step by step — via a web UI, a REST/WebSocket
API, or a CLI.

[![CI](https://github.com/OWNER/lyraxc/actions/workflows/ci.yml/badge.svg)](https://github.com/OWNER/lyraxc/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

---

## Table of contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Screenshots](#screenshots)
- [API documentation](#api-documentation)
- [Testing](#testing)
- [Deployment](#deployment)
- [Extending Lyraxc](#extending-lyraxc)
- [Security](#security)
- [License](#license)

---

## Overview

Lyraxc runs a **perceive → plan → act** loop:

1. **Perceive** — capture a compact snapshot of the current page (URL, title,
   visible text and interactive elements with stable selectors).
2. **Plan** — a pluggable "brain" decides the single next action. Ships with an
   offline **heuristic planner** (no API key needed) and an **OpenAI-compatible
   LLM planner**.
3. **Act** — a Playwright-driven, humanized browser session performs the action
   (navigate, click, type, scroll, wait, extract, screenshot, finish).

The loop repeats until the planner returns `finish` or the step budget is
reached.

## Features

- **Human-like behaviour** — Bézier-curved mouse motion, per-character typing
  with jitter and hesitations, randomized think-time, smooth chunked scrolling.
- **Natural-language tasks** — describe a goal; the agent breaks it into actions.
- **Pluggable brain** — offline heuristic planner or any OpenAI-compatible API
  (OpenAI, Azure, Ollama, LM Studio, OpenRouter…) via one base-URL setting.
- **Three interfaces** — responsive/accessible web UI, REST API, and a CLI.
- **Live streaming** — WebSocket events stream each planned/executed step.
- **Clean architecture** — domain / application / infrastructure / interface
  layers with dependency inversion (ports & adapters) for testability.
- **Safety first** — domain allow/block lists, rate limiting, Helmet, optional
  API-key auth, secret redaction in logs.
- **Fully typed & tested** — TypeScript strict mode, Zod-validated config and
  planner output, Vitest unit tests with fakes (no browser needed in CI).

## Architecture

Clean, layered architecture ("ports and adapters"). Dependencies point inward:
the domain and application layers never import infrastructure directly.

```
src/
├─ domain/            # Enterprise rules: entities, action schema, PORT interfaces
│  ├─ actions.ts      #   Zod-validated action catalogue (single source of truth)
│  ├─ task.ts         #   Task/observation entities
│  └─ ports.ts        #   BrowserProvider, Planner, SafetyPolicy, TaskRepository…
│
├─ application/       # Use cases: the perceive→plan→act orchestration
│  ├─ agent-orchestrator.ts
│  └─ events.ts       #   Streaming event contract
│
├─ infrastructure/    # Adapters implementing the ports
│  ├─ browser/        #   Playwright session + Humanizer
│  ├─ planner/        #   HeuristicPlanner + OpenAiPlanner + prompts
│  ├─ persistence/    #   InMemoryTaskRepository
│  ├─ safety/         #   DomainSafetyPolicy
│  └─ logging/        #   pino logger
│
├─ interface/         # Delivery mechanisms
│  ├─ http/           #   Express API, middleware, WebSocket server
│  └─ cli/            #   Command-line entry point
│
├─ config/            # Zod-validated environment configuration
├─ shared/            # Cross-cutting errors & utilities
└─ container.ts       # Composition root (dependency injection)

web/                  # Framework-free responsive/accessible UI (served statically)
tests/                # Vitest unit tests + fakes
```

**Why this matters:** you can swap the browser engine, the planner/LLM, or the
persistence layer by writing a new adapter that satisfies the same port — no
changes to the core agent logic.

## Installation

### Prerequisites

- **Node.js 20+**
- On first install, Chromium is downloaded automatically for Playwright.

### Steps

```bash
git clone https://github.com/OWNER/lyraxc.git
cd lyraxc
npm install                       # also installs Chromium via postinstall
cp .env.example .env              # then edit values as needed
```

If the browser did not install (restricted environment), run it manually:

```bash
npx playwright install chromium
```

## Configuration

All configuration is provided via environment variables (validated at startup
with Zod). Copy `.env.example` to `.env` and adjust. Key options:

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` / `HOST` | `3000` / `127.0.0.1` | HTTP server bind. |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated allowed origins. |
| `API_KEY` | _(empty)_ | Bearer token required by the API/WebSocket. Empty = no auth (dev only). |
| `LOG_LEVEL` / `LOG_PRETTY` | `info` / `true` | Logging verbosity and pretty output. |
| `BROWSER_HEADLESS` | `true` | Run Chromium headless. Set `false` to watch it. |
| `BROWSER_SLOW_MO` | `0` | Slow every Playwright op by N ms. |
| `BROWSER_TIMEOUT_MS` | `30000` | Navigation/action timeout. |
| `HUMANIZE_ENABLED` | `true` | Toggle human-like motion/typing/pauses. |
| `HUMANIZE_TYPING_MIN/MAX_MS` | `45` / `140` | Per-character typing delay range. |
| `HUMANIZE_ACTION_MIN/MAX_MS` | `350` / `1200` | Think-time between actions. |
| `LLM_PROVIDER` | `mock` | `mock` (offline heuristic) or `openai`. |
| `LLM_BASE_URL` | OpenAI | Any OpenAI-compatible `/chat/completions` base. |
| `LLM_API_KEY` / `LLM_MODEL` | _(empty)_ / `gpt-4o-mini` | LLM credentials/model. |
| `AGENT_MAX_STEPS` | `25` | Hard cap on steps per task. |
| `ALLOWED_DOMAINS` / `BLOCKED_DOMAINS` | _(empty)_ | Safety allow/block lists. |

> The default `LLM_PROVIDER=mock` lets you run the whole app **offline** with no
> API key. Switch to `openai` and set `LLM_API_KEY` for LLM-driven planning.

## Usage

### Web UI

```bash
npm run dev            # starts API + WebSocket + static UI at http://localhost:3000
```

Open <http://localhost:3000>, enter an instruction (and optional start URL) and
watch each step stream live.

### CLI

```bash
# Dev (TypeScript, no build):
npm run dev:cli -- --url https://example.com "extract the main heading"

# Or after building:
npm run build
npm run cli -- "go to duckduckgo.com and search for playwright"
```

### As a library

```ts
import { createContainer } from 'lyraxc/dist/container.js';

const app = createContainer();
const task = await app.orchestrator.run(
  { instruction: 'open example.com and read the heading' },
  (event) => console.log(event.type),
);
console.log(task.status, task.summary);
await app.shutdown();
```

## Screenshots

> _Placeholder — add real screenshots/GIFs here._

| Web UI | Live activity stream |
| --- | --- |
| ![Lyraxc UI placeholder](docs/screenshot-ui.png) | ![Activity stream placeholder](docs/screenshot-activity.png) |

## API documentation

Base URL: `http://<host>:<port>/api`
Auth: if `API_KEY` is set, send `Authorization: Bearer <API_KEY>`.

### `GET /api/health`

Liveness probe.

```json
{ "status": "ok", "provider": "mock" }
```

### `POST /api/tasks`

Run a task synchronously and return the final result.

Request body:

```json
{ "instruction": "search for playwright on duckduckgo.com", "startUrl": "https://duckduckgo.com" }
```

Response `201`:

```json
{ "task": { "id": "task_...", "status": "completed", "summary": "…", "steps": [ … ] } }
```

### `GET /api/tasks` / `GET /api/tasks/:id`

List all tasks, or fetch one by id.

### WebSocket `ws://<host>:<port>/ws`

Send:

```json
{ "type": "run", "instruction": "…", "startUrl": "https://…" }
```

Receive a stream of events: `task:started`, `step:planned`, `step:executed`,
`task:status`, `task:finished` (and `error`). Append `?apiKey=<API_KEY>` to the
URL when auth is enabled.

### Error format

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "…", "details": {} } }
```

## Testing

```bash
npm test               # run all unit tests
npm run test:watch     # watch mode
npm run test:coverage  # coverage report (text + lcov)
```

Unit tests use in-memory **fakes** for the browser and planner ports, so they run
fast and require **no browser or network** — ideal for CI.

Quality gates:

```bash
npm run lint           # ESLint
npm run typecheck      # tsc --noEmit
npm run build          # bundle with tsup
```

## Deployment

### Docker

```dockerfile
FROM mcr.microsoft.com/playwright:v1.46.0-jammy
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV HOST=0.0.0.0 BROWSER_HEADLESS=true LOG_PRETTY=false
EXPOSE 3000
CMD ["npm", "start"]
```

```bash
docker build -t lyraxc .
docker run --rm -p 3000:3000 --env-file .env lyraxc
```

### Bare metal / PaaS

```bash
npm ci
npm run build
NODE_ENV=production npm start
```

Set `BROWSER_HEADLESS=true`, `LOG_PRETTY=false`, a strong `API_KEY`, restrict
`CORS_ORIGINS`, and consider `ALLOWED_DOMAINS` for a tighter safety posture.

## Extending Lyraxc

- **New action** — add a Zod schema in `src/domain/actions.ts`, handle it in
  `PlaywrightSession.dispatch`, and (optionally) teach the planner to emit it.
- **New brain/LLM** — implement the `Planner` port and wire it in
  `src/container.ts`.
- **Persistence** — implement `TaskRepository` (e.g. Postgres/Redis) and swap it
  in the composition root.
- **Different browser engine** — implement `BrowserProvider`/`BrowserSession`.

## Security

- Optional bearer-token auth on both HTTP and WebSocket.
- `helmet` security headers and per-IP rate limiting.
- Domain **allow/block lists** enforced before every navigation.
- Secrets are **redacted** from logs; configuration is validated at startup.
- No credentials are committed — use `.env` (git-ignored) or platform secrets.

> ⚠️ **Responsible use:** only automate sites you own or are permitted to
> automate, and respect each site's Terms of Service and `robots.txt`.

## License

[MIT](./LICENSE) © Lyraxc Contributors
