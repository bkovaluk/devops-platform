# DevOps Platform — frontend

A React console for operating services across environments: a shell (rail,
top bar, environment breadcrumb, command palette, Home), a tool registry that
every surface is built from, scope-based access, a two-person approval flow,
and one example tool — feature flags — that uses all of it.

A second tool, Investigations, reviews the findings of an alarm-investigating
DevOps agent.

It talks to the FastAPI backend in `../backend` through the contract in
`../CONTRACT.md`, or to an in-browser mock of that contract (MSW mode).

## Quick start

```bash
bun install
bun run dev                    # http://localhost:5173, proxies the API to :8000
```

No backend running? Use MSW mode:

```bash
bun run dev                    # then open http://localhost:5173/?msw=1
# or set VITE_USE_MSW=true in .env.local
```

Pick who you are with `?as=admin|editor|reviewer|viewer|empty`, or from the
account menu while MSW mode is on. The assistant dock (the sparkles in the top
bar) answers from a scripted agent; `?assistant=off` shows the console as a
deployment without one. See `src/test/msw/README.md`.

Against the real backend the dock appears when it runs with `AGENT_MODEL` set.

## Scripts

| Script                            | What it does                                                |
| --------------------------------- | ----------------------------------------------------------- |
| `bun run dev`                     | Dev server (`vp dev`)                                       |
| `bun run build`                   | Production build (`vp build`, Vite 8 + Rolldown)            |
| `bun run check`                   | Format, lint and type check in one pass (`vp check`)        |
| `bun run typecheck`               | Type check only (TypeScript Go via `vp check`)              |
| `bun run lint`                    | Oxlint, type-aware (`vp lint`)                              |
| `bun run format`                  | Oxfmt (`vp fmt`); `format:check` verifies                   |
| `bun run test`                    | Unit, component and standards tests (`vp test run`)         |
| `bun run generate-api-types`      | `src/types/api-generated.ts` from `../backend/openapi.json` |
| `bun run generate-scope-contract` | Copy `../scope-contract.json` into `src/features/auth/`     |
| `bun run registry:build`          | Write `../registry.json` from `scripts/registry/items.ts`   |
| `bun run screenshots`             | Both themes at four widths in MSW mode; fails on errors     |
| `bun run storybook`               | Component sandbox on :6006                                  |

The toolchain is [Vite+](https://viteplus.dev) (`vp`): Vite, Vitest, Oxlint
and Oxfmt from one dependency, configured in `vite.config.ts`.

The project type-checks with TypeScript 7. openapi-typescript is built on the
TypeScript 5 compiler API, so `generate-api-types` runs it with
`scripts/api-types/typescript5.ts` preloaded, which resolves its `typescript`
imports to `typescript5` (TypeScript 5.9 under an npm alias);
`check-api-types` is the same run with `--check`.

`bun run screenshots` (`scripts/screenshots/sweep.ts`) starts a dev server in
MSW mode, captures the reference screens, every page at 1440, 1024, 820 and
390 and every principal, in both themes, into `screenshots/`, and stops the
server by its PID. Install its browser once with
`bunx playwright install chromium`.

## Stack

React 19, TypeScript (strict), React Compiler, Tailwind CSS v4 (CSS-first),
Base UI primitives (dialog, collapsible, switch, toast), native popovers placed
with CSS anchor positioning, TanStack Query v5, TanStack Router (code-based
routes, validated search params, view transitions), Zustand (client state
only), Lucide, cmdk, the AG-UI client (`@ag-ui/client`) and shadcn's chat
components for the assistant, Fontsource fonts (Mona Sans, Hubot Sans and
Martian Mono), MSW 3, Testing Library,
Storybook. Motion is CSS alone:
transitions, `@starting-style` and the View Transitions API. Bun is the package
manager.

Hints, menus and popovers rely on the Popover API and CSS anchor positioning
(current Chrome, Edge, Safari and Firefox); a browser without anchor
positioning still gets them, placed by measurement as they open.

## Install it from the shadcn registry

`../registry.json` publishes this frontend as a
[shadcn GitHub registry](https://ui.shadcn.com/docs/registry/github): any
item installs into another Vite + React + Tailwind CSS v4 app with the shadcn
CLI, its npm packages and the items it needs coming along with it.

```bash
npx shadcn@latest list bkovaluk/devops-platform              # every item
npx shadcn@latest view bkovaluk/devops-platform/fold         # one item, before installing
npx shadcn@latest add bkovaluk/devops-platform/fold          # a primitive and what it needs
npx shadcn@latest add bkovaluk/devops-platform/app-shell     # the whole console
npx shadcn@latest add bkovaluk/devops-platform/fold#<sha>    # pinned to a tag or commit SHA
```

The target app needs a `components.json` whose `ui` and `lib` aliases are the
usual `@/components/ui` and `@/lib`, and an `@/` alias that points at `src/`:
files land at the same paths they have here.

- **Foundation:** `tokens`, `fonts`, `utils`, `env`, `theme-constants`, `popover`,
  `view-transition`, `toast`, `ui-store`, `api-types`, `resource-links`
- **Hooks:** `use-copy`, `identity`, `api-client`, `identity-bound-mutation`,
  `scopes`, `config`
- **Primitives:** `section-header`, `fold`, `hint` (with `InfoTip`), `menu`,
  `empty-state`, `error-state`, `skeleton`, `state-mark`, `chip`, `env-signal`,
  `list-card`, `panel`, `button` (with `IconButton` and `CopyButton`), `input`,
  `kbd`, `dialog`, `sheet`, `segmented-control`, `switch`, `toaster`,
  `metric-track` (with `MetricStrip`), `resource-anchor`, `theme-toggle`,
  `command-palette`, `message`, `bubble`, `message-scroller`
- **Blocks:** `app-shell`, `tool-registry`, `approvals`, `example-tool` (the
  flags tool), `assistant` (the dock over `POST /api/agent`), `mock-api`
- **Files:** `design-doc` (`DESIGN.md`), `standards-tests` (the six ratchets
  and their scanner)
- **Agent:** `agent-rules`, the Claude Code skills from `../.claude/skills/`
  (`add-tool`, `add-approval-action`, `ai-actions`, `api-contract`,
  `design-standards`, `screenshot-sweep`), installed into `.claude/skills/`

- `tokens` is `src/index.css` and replaces the target's; every primitive
  depends on it. It names the font families; `fonts` (`src/fonts.ts`) loads
  them from Fontsource packages, which install with it, and the app shell
  imports it once from `main.tsx`.
- `app-shell` installs `main.tsx`, `App.tsx` and `router.tsx` over the
  target's, and brings the registry, approvals, the flags tool and MSW mode
  with it: `?msw=1` runs the console with no backend.
- `standards-tests` import from `vite-plus/test`.

`registry.json` is generated: `scripts/registry/items.ts` lists each item's
files, and `bun run registry:build` reads their imports for the npm packages
(at the versions in `package.json`) and the items they need.
`scripts/registry/registry.test.ts` fails when `registry.json` is stale, when a
shipped file imports something its item does not declare, or when a new file
under `src/` belongs to no item. `npx shadcn@latest registry validate` (from
the repo root) checks the schema and that every listed file exists.

## Read next

- `CLAUDE.md` — how the code is organised, how to add a tool, the rules.
- `DESIGN.md` — the visual and interaction language, and the eight component
  standards the tests enforce.
