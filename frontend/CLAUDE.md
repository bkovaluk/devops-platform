# Frontend: notes for coding agents

Read `README.md` for the stack and scripts, `DESIGN.md` before authoring any
surface, and `../CONTRACT.md` for the API.

## Commands

```bash
bun install
bun run typecheck && bun run lint && bun run test   # the verify chain
bun run build
bun run check            # format + lint + types in one pass
bun run format           # Oxfmt; never hand-format
bun run generate-api-types   # openapi-typescript on the typescript5 alias
bun run generate-scope-contract
bun run registry:build   # registry.json from scripts/registry/items.ts
bun run screenshots      # MSW-mode sweep, both themes, four widths
```

The skills in `../.claude/skills/` walk through the common changes: adding a
tool, an approval-gated action, an AI action, a contract change, a design
review and the screenshot sweep.

All tooling runs through Vite+ (`vp`). Its config — Vite, Vitest (`test`),
Oxlint (`lint`) and Oxfmt (`fmt`) — is the one `vite.config.ts`. Test files
import from `vite-plus/test`, never from `vitest`.

## Layout

```
src/
├── App.tsx, main.tsx, router.tsx   # providers, boot, the route tree
├── app/                            # surfaces
│   ├── AppShell.tsx                # chrome + workspace + assistant dock + palette
│   ├── layout/                     # Sidebar, TopBar, EnvBreadcrumb, EnvEdge, env-pick,
│   │                               # UserMenu, banners, ViewHeader, HomePage,
│   │                               # AssistantDock, SignInPage
│   ├── assistant/                  # the dock's body: thread, composer, proposal card
│   ├── flags/                      # the example tool
│   ├── investigations/             # the DevOps agent's findings: list, detail, review
│   ├── approvals/                  # the inbox view
│   └── *-affordances.test.ts       # the standards ratchets
├── components/
│   ├── ui/                         # primitives and the design system
│   └── approvals/                  # ApprovalsInbox + resource-registry
├── features/                       # hooks and logic, no markup beyond contributions
│   ├── auth/                       # scopes, principal, view-as, identity, mutations
│   ├── config/                     # GET /config
│   ├── tools/                      # the tool registry, ToolBoundary, contributions
│   ├── flags/                      # flags API, queries, approval-aware actions
│   ├── findings/                   # findings API, URL state, words, reasoning, keys
│   ├── approvals/                  # queue, decisions, toasts
│   └── assistant/                  # AG-UI client, thread store, runtime, proposals
├── lib/                            # api-client, notify, toast, popover, view-transition,
│                                   # resource-links, env, theme
├── stores/ui-store.ts              # theme, rail, overlays — client state only
├── types/                          # api.ts re-exports api-generated.ts
└── test/                           # setup, Popover API stand-in, render helpers,
                                    # MSW mock, source scanners
```

## Adding a tool

A tool is one registry entry, its routes, its hooks and its views.

1. **Scopes.** The backend adds the tool to its vocabulary and regenerates
   `../scope-contract.json`. Run `bun run generate-scope-contract`, add the tool
   and any new action to the `Tool` / `Action` unions in
   `features/auth/permissions.ts` (`permissions.test.ts` fails until you do),
   and add its query roots to `TOOL_QUERY_PREFIXES` in
   `features/auth/identity-cache.ts`.
2. **Types.** `bun run generate-api-types`, then re-export the new schemas
   from `types/api.ts`.
3. **Hooks** in `features/<tool>/`: a `<tool>-api.ts` with fetchers and a
   query-key factory rooted at the tool's prefix, `use-<tool>.ts` queries, and
   a `use-<tool>-actions.ts` that is approval-aware (below). Every mutation is
   `useIdentityBoundMutation`.
4. **Routes** in `router.tsx`: the tool's root route renders
   `<ToolBoundary tool={TOOL_REGISTRY.<id>} />`; child routes hang under it.
   Every piece of URL state is a zod schema passed to `validateSearch`, kept in
   `features/<tool>/<tool>-search.ts`. Views read it with
   `getRouteApi('<route id>').useSearch()`.
5. **Registry entry** in `features/tools/tool-registry.tsx`:

   ```ts
   widgets: {
     id: 'widgets',
     label: 'Widgets',
     icon: Box,
     accent: TOOL_ACCENTS.widgets.text,   // add the accent in lib/theme-constants.ts
     group: 'tools',                       // 'shell' | 'inbox' | 'tools' | 'hidden'
     path: '/widgets',                     // add to ToolPath
     view: WidgetsView,                    // lazy(() => import(...))
     access: { kind: 'scoped', tool: 'widgets', entry: inAnyEnv('widgets', 'read') },
     env: 'any',                           // 'any': the env pick steers it; 'none': tied to no env
     itemInEveryEnv: true,                 // another env on an item's page opens the same item
     approvalRouted: true,                 // writes outside direct envs become requests
     title: 'Widgets',                     // document title segment
     shortcutRank: 3,                      // rail order and digit shortcut
     homeTile: { rank: 1, component: WidgetsHomeTile },
     paletteCommands: [{ id: 'create-widget', label: 'New widget', hint: '…', icon: Plus,
       run: (navigate) => navigate({ to: '/widgets', search: (prev) => ({ ...prev, create: true }) }) }],
     contributions: { count, quickAction, attention, activity, palette, teardown },
   },
   ```

   `entry` is the scope of the first read the tool makes: a principal who holds
   none of it never sees the tool, in the rail, on Home, in the palette, or by
   deep link. Contributions are components in `features/tools/contributions/`;
   shared surfaces mount them only for tools the principal can open, and
   mounting is what starts their queries. A contribution reads its own tool and
   no other. `tool-registry.test.tsx` checks every entry's path is a route.

6. **Links.** Extend `ResourceLink` in `lib/resource-links.ts`;
   `resource-links.test.ts` checks every link opens a route. Add a
   `<tool>-toast.ts` that calls `notifyWithLink`.
7. **Approvals.** If the tool's writes can become approval requests, add one
   entry to `RESOURCE_REGISTRY` in `components/approvals/resource-registry.tsx`
   (icon, words, link, diff). Nothing else branches on `approval.tool`.
8. **MSW.** Add the routes to `test/msw/handlers.ts` and fixtures to
   `test/msw/db.ts`, on the API's terms.

## The environment

The env lives in the URL and nowhere else: the shell's `env` search param on a
list (absent is every env), or the `$env` path param of a single item. The top
bar names it as a breadcrumb (`app/layout/EnvBreadcrumb.tsx`) and `EnvEdge`
draws its colour along the top of the window; `app/layout/env-pick.ts` holds
the rules both use.

- Only the person changes it, from the breadcrumb or with ⌥0 (every env) and
  ⌥1 onwards. Never navigate to another env on anyone's behalf: no
  "advance to the next item" that lands in another env, no default env.
- Every env stays in the menu. One the open tool cannot show, or one the
  principal cannot read there (`pickRefusal`), is a disabled `MenuItem` with
  the reason under it, never hidden.
- A tool declares in the registry how the pick steers it (`env: 'any' |
  'none'`). On an item's page, `itemInEveryEnv` opens the same item in the env
  picked (flags); without it the pick returns to the tool's list in that env,
  with the list's own keys (investigations).
- `EnvBanner` ("writes require approval") shows only for a tool with
  `approvalRouted`, for the env on screen.

## Investigations

`app/investigations/` and `features/findings/` review the findings of an
alarm-investigating DevOps agent (`/api/findings`). The list's tab, window,
search and facets are URL state (`features/findings/findings-search.ts`); the
open finding is `/investigations/$env/$findingId`, and the close dialog is
`?close=<resolution>`. Reviews go through `use-finding-actions.ts` and apply
directly in every env: they are never approval requests, so the tool does not
use `useNeedsApproval` and its entry has no `approvalRouted`. Single-key
triage shortcuts (`j`, `k`, `/`, `a`, `c`, `h`, `?`, Escape) are
`use-triage-keys.ts`; a key typed into a field or inside an overlay is never
theirs. Model text is drawn by `FindingProse` as text, never as markup.

## Approval-aware writes

Environments come from `/config`; `direct_envs` apply changes at once and every
other environment turns a write into an approval request (202). The pattern is
`features/flags/use-flag-actions.ts`:

- one hook per tool returns `create`, `update`, `remove`, `isPending` and
  `needsApproval(env)`; call sites never branch on the environment;
- the hook reads `applied` from the answer and toasts accordingly — a link to
  the resource, or a link to the request — and invalidates the right roots;
- the form asks `needsApproval(env)` _before_ submit: an amber `glass-amber`
  submit with `GitPullRequest` reading "Request approval for {env}", and an
  amber callout saying a teammate must approve it. Direct envs say
  "Save to {env}".

## Auth rules

- Ask `useScopes().can(scope)` / `canAny(scopes)`; build env-qualified scopes
  with `inEnv(tool, action, env)` and `inAnyEnv(tool, action)`. Nothing reads
  `is_admin` outside `features/auth/`.
- A tool's reachability is `canOpen(grants, tool)` from the registry.
- View-as (`X-View-As: <email>`, admins only) is a read-only lens held in
  `sessionStorage`. Changing it is an identity change: private caches clear.
  Every control that changes something is refused under it by `Button`
  (`mutates`, a submit, or a consequence variant);
  `app/mutation-affordances.test.ts` fails the build for a mutation wired to a
  control the guard cannot reach.
- Every mutation uses `useIdentityBoundMutation`; the lint rule and
  `no-direct-use-mutation.test.ts` refuse `useMutation`.
- Mutation failures toast through `notifyFailure`, never `toast.error`.

## API types and the scope contract

`src/types/api-generated.ts` and `src/features/auth/scope-contract.json` are
generated from the backend and never edited. After pulling backend changes run
both generate scripts; `tsc` and `permissions.test.ts` then point at every place
the contract moved. `check-api-types` and `check-scope-contract` fail on drift.

## Conventions

- Components PascalCase, one per file; hooks `use-kebab-case.ts`.
- Server state in TanStack Query only; Zustand for state no server owns.
- No hand-written `useMemo` / `useCallback` / `memo`: React Compiler does it.
- No native `title=`; hints come from `components/ui/hint.tsx`.
- Colours from tokens (`index.css`), tool identity from `TOOL_ACCENTS`, env
  colour from `lib/env.ts`, state from the `state-*` tokens.
- Use `example.com` for every email and domain.

## The assistant

The dock talks to `POST /api/agent` (AG-UI over SSE) through `@ag-ui/client`,
with the same credential and `X-View-As` as every request
(`features/assistant/agent-client.ts`). It is offered only when
`/api/agent/status` says enabled and the principal holds a grant. A write never
happens in the run that proposes it: the run ends with an interrupt, the dock
shows a `ProposalCard` drawn by `RESOURCE_REGISTRY` (so a new approval-eligible
tool needs nothing here), and the confirm or cancel resumes the thread. The
thread lives in `sessionStorage` and ends with the identity, like the private
caches.

## Fonts

`src/fonts.ts` imports the Fontsource packages, once; the tokens in
`index.css` name the families. A new pairing is that file, the `--font-*`
values and `package.json`.

## Primitives, popovers and motion

- Modal overlays are Base UI Dialog (`@base-ui/react`): use `Dialog`, `Sheet`
  or the palette, never a bespoke modal. `Fold` / `FoldRow` are Base UI
  Collapsible, `Switch` is Base UI Switch, and `asChild` is Base UI `useRender`.
  The DESIGN.md standards are the API; Base UI is what sits under it.
- Anything anchored to a control that traps no focus — a hint, an `InfoTip`, a
  menu (`components/ui/menu`), the minute popover — is a native popover placed
  with CSS anchor positioning through `lib/popover.ts`. No portals, no z-index,
  no JS positioning library.
- Toasts are Base UI Toast with a global manager: raise them through
  `lib/toast.ts` (or `notifyWithLink` / `notifyFailure`), from anywhere.
- No animation library. Entries are `@starting-style` (Tailwind `starting:`);
  Base UI overlays leave through `data-ending-style:`; native popovers leave
  with `.popover-motion`. A navigation that swaps a list's detail or the
  inbox's lens passes `viewTransition`, and the pane it swaps carries
  `TRANSITION_PANE`; env and theme swaps go through `withViewTransition`.
  Timings are the `--duration*` / `--ease-*` tokens; reduced motion is the CSS
  catch-all in `index.css`.
- jsdom has no Popover API: `test/popover-polyfill.ts` stands in for it
  (open and closed state, toggle events, invokers, light dismiss, focus
  return), so tests query popovers by role as a browser shows them.
