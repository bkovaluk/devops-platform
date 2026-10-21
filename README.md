# DevOps Platform

An opinionated starter for internal operations consoles, with approvals and AI
built in. Every tool you add gets the same frame: resources per environment,
scope-based permissions, an admin "view as", a two-person rule for every
change outside the direct environments, and an assistant and an MCP server that
act as the signed-in person and nothing more.

It is two halves and one contract: a FastAPI backend in `backend/`, a React
console in `frontend/`, and `CONTRACT.md` between them. Feature flags are the
example tool, built the way every tool should be.

<picture>
  <source media="(prefers-color-scheme: light)" srcset="docs/screens/flag-detail-minute-popover-light.png">
  <img alt="A feature flag in staging: its facts, an hour of evaluations as quiet columns, and one minute's reading open in a popover" src="docs/screens/flag-detail-minute-popover-dark.png">
</picture>

## The screens

**Home.** What needs you, the tools your roles open, and the latest changes
and requests across every environment.

<picture>
  <source media="(prefers-color-scheme: light)" srcset="docs/screens/home-light.png">
  <img alt="Home: pending approvals, partial rollouts, the tools tile and the activity feed" src="docs/screens/home-dark.png">
</picture>

**A tool's list.** One row recipe, environment as a quiet signal, the fact on
the right in one word.

<picture>
  <source media="(prefers-color-scheme: light)" srcset="docs/screens/flags-list-all-envs-light.png">
  <img alt="The feature flags list across all environments" src="docs/screens/flags-list-all-envs-dark.png">
</picture>

**A change outside dev.** The sheet says what will happen before you press
anything: an amber "Request approval for staging" and the reason.

<picture>
  <source media="(prefers-color-scheme: light)" srcset="docs/screens/flag-edit-staging-approval-light.png">
  <img alt="Editing a flag in staging: the amber approval submit and its callout" src="docs/screens/flag-edit-staging-approval-dark.png">
</picture>

**Approvals.** The inbox shows each request with its before and after; approve
is one press, reject needs a note, nobody reviews their own.

<picture>
  <source media="(prefers-color-scheme: light)" srcset="docs/screens/approvals-inbox-light.png">
  <img alt="The approvals inbox with one request expanded to its field diff" src="docs/screens/approvals-inbox-dark.png">
</picture>

**The assistant.** Reads run at once. A write is a proposal with its diff and
the same confirm the sheets use; confirmed outside dev, it becomes an approval
request like any other.

<picture>
  <source media="(prefers-color-scheme: light)" srcset="docs/screens/assistant-interrupt-staging-light.png">
  <img alt="The assistant proposing a rollout change in staging, waiting for confirmation" src="docs/screens/assistant-interrupt-staging-dark.png">
</picture>

<picture>
  <source media="(prefers-color-scheme: light)" srcset="docs/screens/assistant-confirmed-light.png">
  <img alt="The assistant after the change was confirmed and filed as an approval request" src="docs/screens/assistant-confirmed-dark.png">
</picture>

The screens are taken by `frontend/scripts/screenshots/sweep.ts` in MSW mode
(`PASSES=scenes OUT=../docs/screens bun run screenshots`).

## Quick start

Backend, in dev mode (every request is `ada@example.com`, an admin; an
in-memory store seeded with example flags and pending requests):

```bash
cd backend
uv sync --all-extras
uv run uvicorn platform_api.main:app --reload --port 8000
```

Frontend, against that backend or with no backend at all:

```bash
cd frontend
bun install
bun run dev                      # http://localhost:5173, proxies the API to :8000
                                 # or http://localhost:5173/?msw=1 for the in-browser mock
```

In MSW mode `?as=admin|editor|reviewer|viewer|empty` picks who you are and
`?assistant=off` shows a deployment without the assistant. Against the real
backend the assistant appears when it runs with `AGENT_MODEL` set.

## Stack

| Half     | What                                                                                       |
| -------- | ------------------------------------------------------------------------------------------ |
| Backend  | Python 3.15, FastAPI 0.156, Pydantic 2.14, FastMCP 4.1, Pydantic AI 2.58 (AG-UI), boto3, uv |
| Frontend | React 19.3, TypeScript 7, Vite+ 1.3 (Vite 8, Vitest 5, Oxlint, Oxfmt), Tailwind CSS 4.3, Base UI 1.9, TanStack Query 5 and Router 1, Zustand 5, zod 4, MSW 3, Storybook 10, Bun |
| Fonts    | Mona Sans, Hubot Sans and Martian Mono from Fontsource                                     |
| Storage  | In memory, or one DynamoDB table                                                           |
| Auth     | Dev mode, or any OIDC provider (bearer ID tokens)                                          |

## How the halves fit

`CONTRACT.md` is the agreement, written for people. The backend generates the
machine forms from its code: `backend/openapi.json` and `scope-contract.json`
(the scope vocabulary, the seeded roles and conformance cases). The frontend
generates its types and its copy of the scope contract from them, and both
halves fail their checks when a generated file is stale. A change to a route,
a model, a scope or a role is one change across all of them.

- `backend/README.md`: running, configuration, auth, approvals, MCP and the
  assistant, adding a tool on the backend.
- `frontend/README.md`: scripts, stack, MSW mode, the registry.
- `frontend/DESIGN.md`: the visual language and the eight component standards
  the tests enforce.

## Use it in your own app

`registry.json` makes this repository a
[shadcn GitHub registry](https://ui.shadcn.com/docs/registry/github): install
the design system piece by piece, the whole console, or the agent skills.

```bash
npx shadcn@latest list bkovaluk/devops-platform
npx shadcn@latest add bkovaluk/devops-platform/fold
npx shadcn@latest add bkovaluk/devops-platform/app-shell
npx shadcn@latest add bkovaluk/devops-platform/agent-rules
```

The items, what each installs and what a target app needs are in
`frontend/README.md`.

## Skills for coding agents

`.claude/skills/` holds Claude Code skills grounded in this repo's paths and
commands; `AGENTS.md` points at them. The `agent-rules` registry item installs
them into another project.

| Skill                 | For                                                            |
| --------------------- | -------------------------------------------------------------- |
| `add-tool`            | a new tool end to end, backend and frontend                    |
| `add-approval-action` | an action behind the two-person rule on both halves            |
| `ai-actions`          | exposing an action to MCP and the assistant safely             |
| `api-contract`        | changing the contract and regenerating every artifact          |
| `design-standards`    | building or reviewing UI against the standards and ratchets    |
| `screenshot-sweep`    | both themes at four widths, failing on errors and overflow     |

## Licence

MIT. See `LICENSE`.
