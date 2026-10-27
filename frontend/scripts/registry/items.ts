/**
 * What `registry.json` publishes, item by item. An item names its files (as
 * paths under `src/`) and says what it is; its npm packages and the items it
 * needs are read from those files' imports by `build.ts`, never listed here.
 */

export type ItemType =
  | 'registry:style'
  | 'registry:lib'
  | 'registry:hook'
  | 'registry:ui'
  | 'registry:block'
  | 'registry:file'
  | 'registry:item'

export interface ExtraFile {
  path: string
  type: 'registry:file'
  target: string
}

export interface ItemSpec {
  name: string
  type: ItemType
  title: string
  description: string
  /** Files under `src/`. */
  src?: readonly string[]
  /** Files outside `src/`, shipped as they are. */
  extraFiles?: readonly ExtraFile[]
  /** One type for every file, where the path would say otherwise. */
  fileType?: 'registry:file'
  /** Its packages are needed to test the target, not to run it. */
  devOnly?: boolean
  extends?: 'none'
  categories: readonly string[]
}

/** Source files no item ships: the harness the tests run in. */
export const UNSHIPPED: readonly string[] = [
  'test/setup.ts',
  'test/render.tsx',
  'test/popover-polyfill.ts',
  'test/msw/node.ts',
  'test/msw/README.md',
]

/** The skills under `.claude/skills/` at the repo root, shipped by `agent-rules`. */
const SKILLS = [
  'add-tool',
  'add-approval-action',
  'ai-actions',
  'api-contract',
  'design-standards',
  'screenshot-sweep',
] as const

export const ITEMS: readonly ItemSpec[] = [
  // foundation
  {
    name: 'tokens',
    type: 'registry:style',
    extends: 'none',
    title: 'Tokens',
    description:
      'The design tokens and global CSS: the ink-blue dark ramp and the paper light ramp, state, signal, env and data-ink colours, the font families, the seven-step type scale, gutters, motion timings, the caps label utilities, the @position-try fallbacks for anchored popovers, and the reduced-motion catch-all. Replaces src/index.css; Tailwind CSS v4.',
    fileType: 'registry:file',
    src: ['index.css'],
    categories: ['foundation'],
  },
  {
    name: 'fonts',
    type: 'registry:lib',
    title: 'Fonts',
    description:
      'The font files, from Fontsource packages, imported once. The families they declare are named in the tokens.',
    src: ['fonts.ts'],
    categories: ['foundation'],
  },
  {
    name: 'utils',
    type: 'registry:lib',
    title: 'Utils',
    description: '`cn` (clsx + tailwind-merge) and the date helpers every surface formats with.',
    src: ['lib/utils.ts'],
    categories: ['foundation'],
  },
  {
    name: 'env',
    type: 'registry:lib',
    title: 'Environment colours',
    description:
      'Environment names, labels and the one place env colour comes from: dev green, qa sky, staging violet, prod rose, anything else neutral.',
    src: ['lib/env.ts'],
    categories: ['foundation'],
  },
  {
    name: 'theme-constants',
    type: 'registry:lib',
    title: 'Tool accents',
    description: 'TOOL_ACCENTS: the one source of a tool’s identity colour.',
    src: ['lib/theme-constants.ts'],
    categories: ['foundation'],
  },
  {
    name: 'popover',
    type: 'registry:lib',
    title: 'Anchored popovers',
    description:
      'Native popovers placed with CSS anchor positioning: anchor names, placement styles, and a measured fallback for browsers without anchor positioning. No portals, no z-index.',
    src: ['lib/popover.ts'],
    categories: ['foundation'],
  },
  {
    name: 'view-transition',
    type: 'registry:lib',
    title: 'View transitions',
    description:
      '`withViewTransition` for whole-page swaps (env, theme) and `TRANSITION_PANE` for the pane a list navigation swaps.',
    src: ['lib/view-transition.ts'],
    categories: ['foundation'],
  },
  {
    name: 'toast',
    type: 'registry:lib',
    title: 'Toast manager',
    description:
      'The global Base UI toast manager: raise a toast from anywhere, inside React or not.',
    src: ['lib/toast.ts'],
    categories: ['foundation'],
  },
  {
    name: 'use-copy',
    type: 'registry:hook',
    title: 'useCopy',
    description: 'Copy to the clipboard and hold a "copied" state long enough to be seen.',
    src: ['lib/use-copy.ts'],
    categories: ['hooks'],
  },
  {
    name: 'ui-store',
    type: 'registry:lib',
    title: 'UI store',
    description:
      'Client state no server owns (theme, rail, overlays) in Zustand, and the effect that applies the theme class to <html>.',
    src: ['stores/ui-store.ts', 'lib/use-theme.ts'],
    categories: ['foundation'],
  },
  {
    name: 'api-types',
    type: 'registry:lib',
    title: 'API types',
    description:
      'The API’s shapes under the names the UI uses, re-exported from types generated from the backend’s openapi.json.',
    src: ['types/api.ts', 'types/api-generated.ts'],
    categories: ['foundation'],
  },
  {
    name: 'identity',
    type: 'registry:lib',
    title: 'Identity',
    description:
      'Who is asking: the bearer credential, the admin view-as lens, and `identityGeneration`, the one number that moves whenever the account, the lens or a grant changes.',
    src: [
      'features/auth/auth-store.ts',
      'features/auth/view-as.ts',
      'features/auth/identity-generation.ts',
    ],
    categories: ['hooks'],
  },
  {
    name: 'api-client',
    type: 'registry:lib',
    title: 'API client',
    description:
      '`apiFetch` with the credential and view-as headers, `APIError` and `IdentityChangedError`, and the app’s one QueryClient.',
    src: ['lib/api-client.ts', 'lib/query-client.ts'],
    categories: ['hooks'],
  },
  {
    name: 'identity-bound-mutation',
    type: 'registry:hook',
    title: 'useIdentityBoundMutation',
    description:
      'The only way to write: a TanStack mutation that belongs, start to finish, to the identity that started it, so retries, rollbacks and invalidations never act for somebody else.',
    src: ['features/auth/use-identity-bound-mutation.ts'],
    categories: ['hooks'],
  },
  {
    name: 'scopes',
    type: 'registry:lib',
    title: 'Scopes',
    description:
      'The scope grammar (`<tool>:<action>[:<qualifier>]`, `inEnv`, `inAnyEnv`, `can`, `canAny`) checked against the shared scope-contract.json, `useScopes()` over /auth/me, and the cache boundaries an identity change enforces.',
    src: [
      'features/auth/permissions.ts',
      'features/auth/scope-contract.json',
      'features/auth/use-scopes.ts',
      'features/auth/use-auth-me.ts',
      'features/auth/identity-cache.ts',
    ],
    categories: ['hooks'],
  },
  {
    name: 'config',
    type: 'registry:hook',
    title: 'useConfig',
    description:
      'GET /config: the app name, the environments, and which of them apply writes directly.',
    src: ['features/config/use-config.ts'],
    categories: ['hooks'],
  },
  {
    name: 'resource-links',
    type: 'registry:lib',
    title: 'Resource links',
    description:
      'The typed vocabulary of shareable URLs: every linkable resource and the path it opens.',
    src: ['lib/resource-links.ts'],
    categories: ['foundation'],
  },

  // primitives
  {
    name: 'section-header',
    type: 'registry:ui',
    title: 'SectionHeader',
    description:
      'Every section head: `page` (display 15px, a reading on the right), `pane` (caps label with a hairline), `pane danger`; with SECTION_GAP and SECTION_HEAD_GAP.',
    src: ['components/ui/section-header.tsx'],
    categories: ['primitives'],
  },
  {
    name: 'fold',
    type: 'registry:ui',
    title: 'Fold',
    description:
      '`Fold`, `FoldRow` and `ShowMore` on Base UI Collapsible: a turning left chevron, dashed rules, actions outside the trigger, bodies kept mounted for find-in-page.',
    src: ['components/ui/fold.tsx'],
    categories: ['primitives'],
  },
  {
    name: 'hint',
    type: 'registry:ui',
    title: 'Hint and InfoTip',
    description:
      '`Hint` names a control on hover or focus; `InfoTip` and `InfoTerm` hand over the sentence behind a word on a press. Both are native popovers anchored to their trigger; no native title anywhere.',
    src: ['components/ui/hint.tsx'],
    categories: ['primitives'],
  },
  {
    name: 'menu',
    type: 'registry:ui',
    title: 'Menu',
    description:
      'A native-popover menu: arrows, Home, End and type-ahead, closes on Escape, Tab or a press outside, and hands focus back to its trigger.',
    src: ['components/ui/menu.tsx'],
    categories: ['primitives'],
  },
  {
    name: 'empty-state',
    type: 'registry:ui',
    title: 'EmptyState',
    description: 'The empty state, in page, inspector and inline sizes.',
    src: ['components/ui/empty-state.tsx'],
    categories: ['primitives'],
  },
  {
    name: 'error-state',
    type: 'registry:ui',
    title: 'ErrorState',
    description:
      '"Couldn’t load {noun}", a detail and one soft Retry, in page, inspector and inline sizes; and the ErrorBoundary that renders it.',
    src: ['components/ui/error-state.tsx', 'components/ui/error-boundary.tsx'],
    categories: ['primitives'],
  },
  {
    name: 'skeleton',
    type: 'registry:ui',
    title: 'Skeleton',
    description: 'The one owner of the loading shimmer. No spinners.',
    src: ['components/ui/skeleton.tsx'],
    categories: ['primitives'],
  },
  {
    name: 'state-mark',
    type: 'registry:ui',
    title: 'StateMark',
    description:
      'Health as an 8px mark (6px in dense rows) in the state tokens, always paired with a word for readers.',
    src: ['components/ui/state-mark.tsx'],
    categories: ['primitives'],
  },
  {
    name: 'chip',
    type: 'registry:ui',
    title: 'Chip',
    description: 'A status word: `tone`, `soft` for a fill, `mono` for values, and a `hint`.',
    src: ['components/ui/chip.tsx'],
    categories: ['primitives'],
  },
  {
    name: 'env-signal',
    type: 'registry:ui',
    title: 'EnvSignal',
    description: 'An environment, named in its own colour family. Never a loud badge.',
    src: ['components/ui/env-signal.tsx'],
    categories: ['primitives'],
  },
  {
    name: 'list-card',
    type: 'registry:ui',
    title: 'ListCard',
    description:
      'The one row recipe: a card with a column-label header and hairlines, `ListCard.Surface` rows at 40, 48 or 56px, the solid hover and the one selection mark.',
    src: ['components/ui/list-card.tsx'],
    categories: ['primitives'],
  },
  {
    name: 'panel',
    type: 'registry:ui',
    title: 'Panel',
    description: 'A box of fields: `well`, `card` or `framed`, at rounded-lg.',
    src: ['components/ui/panel.tsx'],
    categories: ['primitives'],
  },
  {
    name: 'button',
    type: 'registry:ui',
    title: 'Button, IconButton, CopyButton',
    description:
      'One ink primary, soft secondaries and the consequence tier (glass-amber, glass-rose, glass-emerald, danger) at three heights. Every control that changes something is refused under a view-as lens. `IconButton` names itself through its hint; `CopyButton` is every copy.',
    src: [
      'components/ui/button.tsx',
      'components/ui/button-variants.ts',
      'components/ui/icon-button.tsx',
      'components/ui/copy-button.tsx',
    ],
    categories: ['primitives'],
  },
  {
    name: 'input',
    type: 'registry:ui',
    title: 'Input, Textarea, Field',
    description: 'Text inputs at the control heights, and the labelled field around them.',
    src: ['components/ui/input.tsx'],
    categories: ['primitives'],
  },
  {
    name: 'kbd',
    type: 'registry:ui',
    title: 'Kbd',
    description: 'A key or a chord, in mono nano.',
    src: ['components/ui/kbd.tsx'],
    categories: ['primitives'],
  },
  {
    name: 'dialog',
    type: 'registry:ui',
    title: 'Dialog',
    description:
      'The modal on Base UI Dialog: focus trap, Escape, focus return, glass, an entry that settles from 95%.',
    src: ['components/ui/dialog.tsx'],
    categories: ['primitives'],
  },
  {
    name: 'sheet',
    type: 'registry:ui',
    title: 'Sheet',
    description: 'The side sheet on Base UI Dialog, for create and edit forms.',
    src: ['components/ui/sheet.tsx'],
    categories: ['primitives'],
  },
  {
    name: 'segmented-control',
    type: 'registry:ui',
    title: 'SegmentedControl',
    description:
      'A radio group whose one pill is anchored to the checked option, so a new choice slides it across.',
    src: ['components/ui/segmented-control.tsx'],
    categories: ['primitives'],
  },
  {
    name: 'switch',
    type: 'registry:ui',
    title: 'Switch',
    description: 'Base UI Switch in the tokens.',
    src: ['components/ui/switch.tsx'],
    categories: ['primitives'],
  },
  {
    name: 'toaster',
    type: 'registry:ui',
    title: 'Toaster',
    description:
      'The toast viewport on Base UI Toast, and `notifyWithLink` / `notifyFailure`: a toast that links to the resource or the request, and the one way a failure is announced.',
    src: ['components/ui/toaster.tsx', 'components/ui/toast-link-row.tsx', 'lib/notify.ts'],
    categories: ['primitives'],
  },
  {
    name: 'metric-track',
    type: 'registry:ui',
    title: 'MetricTrack and MetricStrip',
    description:
      'The quiet-columns chart: `MetricTrack` for a bar chart, `MetricStrip` for the same columns at row height, `MetricAxis` for a shared clock. Data ink, colour only when a reading went wrong, one tab stop with arrow-key buckets.',
    src: ['components/ui/metric-track.tsx', 'components/ui/metric-time.ts'],
    categories: ['primitives'],
  },
  {
    name: 'resource-anchor',
    type: 'registry:ui',
    title: 'ResourceAnchor',
    description: 'A router link to any resource in the ResourceLink vocabulary.',
    src: ['components/ui/resource-anchor.tsx'],
    categories: ['primitives'],
  },
  {
    name: 'theme-toggle',
    type: 'registry:ui',
    title: 'ThemeToggle',
    description: 'Dark and light, crossfaded through a view transition.',
    src: ['components/ui/theme-toggle.tsx'],
    categories: ['primitives'],
  },
  {
    name: 'command-palette',
    type: 'registry:ui',
    title: 'CommandPalette',
    description:
      'The ⌘K palette on cmdk inside a Base UI Dialog: every tool the principal can open, and each tool’s own commands from the registry.',
    src: ['components/ui/command-palette.tsx'],
    categories: ['primitives'],
  },
  {
    name: 'message',
    type: 'registry:ui',
    title: 'Message',
    description:
      'shadcn’s Message in the tokens: one turn of a conversation, aligned to who said it, with a header, content and footer.',
    src: ['components/ui/message.tsx'],
    categories: ['primitives'],
  },
  {
    name: 'bubble',
    type: 'registry:ui',
    title: 'Bubble',
    description:
      'shadcn’s Bubble in the tokens: `filled` for the person’s words on the accent fill, `plain` for the assistant’s as reading text.',
    src: ['components/ui/bubble.tsx'],
    categories: ['primitives'],
  },
  {
    name: 'message-scroller',
    type: 'registry:ui',
    title: 'MessageScroller',
    description:
      'shadcn’s Message Scroller in the tokens: pinned to the newest turn while an answer streams, let go when the reader scrolls up, with an IconButton back down.',
    src: ['components/ui/message-scroller.tsx'],
    categories: ['primitives'],
  },

  // blocks
  {
    name: 'app-shell',
    type: 'registry:block',
    title: 'App shell',
    description:
      'The console frame: the chrome (rail and top bar as one L), the inset workspace, the environment breadcrumb with its coloured top edge and the approval banner, view-as, the user menu, Home, the theme toggle and the palette, wired to the router and providers. Installs main.tsx, App.tsx and router.tsx.',
    src: [
      'main.tsx',
      'App.tsx',
      'router.tsx',
      'app/AppShell.tsx',
      'app/layout/AppChrome.tsx',
      'app/layout/EnvBanner.tsx',
      'app/layout/EnvBreadcrumb.tsx',
      'app/layout/EnvEdge.tsx',
      'app/layout/env-pick.ts',
      'app/layout/HomePage.tsx',
      'app/layout/NotFound.tsx',
      'app/layout/Sidebar.tsx',
      'app/layout/SignInPage.tsx',
      'app/layout/TopBar.tsx',
      'app/layout/UserMenu.tsx',
      'app/layout/ViewAsBanner.tsx',
      'app/layout/ViewAsDialog.tsx',
      'app/layout/ViewHeader.tsx',
      'app/layout/use-focused-env.ts',
    ],
    extraFiles: [
      { path: 'frontend/public/mark.svg', type: 'registry:file', target: '~/public/mark.svg' },
    ],
    categories: ['blocks'],
  },
  {
    name: 'tool-registry',
    type: 'registry:block',
    title: 'Tool registry',
    description:
      'TOOL_REGISTRY, the one list every surface is built from (rail, Home tiles, palette, routes), `ToolBoundary` in front of every tool view, and the contribution slots a tool fills on shared surfaces.',
    src: [
      'features/tools/tool-registry.tsx',
      'features/tools/ToolBoundary.tsx',
      'features/tools/activity-slot.ts',
      'features/tools/contribution-slot.tsx',
      'features/tools/home-parts.tsx',
      'features/tools/palette-parts.tsx',
      'features/tools/contributions/index.ts',
      'features/tools/contributions/approvals.tsx',
      'features/tools/contributions/flags.tsx',
      'features/tools/contributions/investigations.tsx',
    ],
    categories: ['blocks'],
  },
  {
    name: 'approvals',
    type: 'registry:block',
    title: 'Approvals',
    description:
      'The two-person rule: the review inbox, the resource registry each tool adds one entry to, the queue and decision hooks, and `useNeedsApproval`, which an approval-aware action hook asks before submit.',
    src: [
      'app/approvals/ApprovalsView.tsx',
      'components/approvals/ApprovalsInbox.tsx',
      'components/approvals/resource-registry.tsx',
      'features/approvals/approval-search.ts',
      'features/approvals/approval-toast.ts',
      'features/approvals/use-approvals.ts',
      'features/auth/use-needs-approval.ts',
    ],
    categories: ['blocks'],
  },
  {
    name: 'example-tool',
    type: 'registry:block',
    title: 'Example tool: feature flags',
    description:
      'The tool to copy from: a list column and a detail pane, validated URL state, a query-key factory, an approval-aware action hook, a create/edit sheet that names its env on submit, a delete confirm, and a MetricStrip with a minute popover.',
    src: [
      'app/flags/FlagsView.tsx',
      'app/flags/FlagDetail.tsx',
      'app/flags/FlagIdle.tsx',
      'app/flags/FlagSheet.tsx',
      'app/flags/DeleteFlagDialog.tsx',
      'app/flags/EvaluationStrip.tsx',
      'app/flags/MinutePopover.tsx',
      'app/flags/flag-words.ts',
      'features/flags/flags-api.ts',
      'features/flags/use-flags.ts',
      'features/flags/use-flag-actions.ts',
      'features/flags/flag-search.ts',
      'features/flags/flag-toast.ts',
      'features/flags/evaluations.ts',
    ],
    categories: ['blocks'],
  },
  {
    name: 'investigations',
    type: 'registry:block',
    title: 'Investigations',
    description:
      'The review dashboard for an alarm-investigating DevOps agent: a list of its findings by review state with search, facets and j/k keys, and a detail pane with the cause, what it verified, the next steps, the hypotheses it weighed and a notebook of every call it made, with acknowledge and close-with-a-verdict.',
    src: [
      'app/investigations/InvestigationsView.tsx',
      'app/investigations/FindingIdle.tsx',
      'app/investigations/FindingDetail.tsx',
      'app/investigations/FindingFacets.tsx',
      'app/investigations/FindingNotebook.tsx',
      'app/investigations/FindingReasoning.tsx',
      'app/investigations/FindingActions.tsx',
      'app/investigations/FindingDecision.tsx',
      'app/investigations/CloseFindingDialog.tsx',
      'app/investigations/FindingProse.tsx',
      'app/investigations/ShortcutsPopover.tsx',
      'features/findings/findings-api.ts',
      'features/findings/findings-search.ts',
      'features/findings/findings-words.ts',
      'features/findings/findings-reasoning.ts',
      'features/findings/findings-run.ts',
      'features/findings/findings-markdown.ts',
      'features/findings/findings-toast.ts',
      'features/findings/use-findings.ts',
      'features/findings/use-finding-actions.ts',
      'features/findings/use-triage-keys.ts',
    ],
    categories: ['blocks'],
  },
  {
    name: 'assistant',
    type: 'registry:block',
    title: 'Assistant',
    description:
      'The assistant dock: a right panel that talks to POST /api/agent over AG-UI with the official client, streams answers with a quiet row per read, shows each proposed write as a card with its diff to confirm or cancel (an amber request for approval outside the direct envs), and keeps one thread per tab. Offered only when GET /api/agent/status says enabled.',
    src: [
      'app/layout/AssistantDock.tsx',
      'app/assistant/AssistantPanel.tsx',
      'app/assistant/AssistantThread.tsx',
      'app/assistant/AssistantComposer.tsx',
      'app/assistant/ToolCallRow.tsx',
      'app/assistant/ProposalCard.tsx',
      'features/assistant/agent-client.ts',
      'features/assistant/assistant-runtime.ts',
      'features/assistant/assistant-store.ts',
      'features/assistant/assistant-toast.ts',
      'features/assistant/proposal.ts',
      'features/assistant/thread-view.ts',
      'features/assistant/use-agent-status.ts',
    ],
    categories: ['blocks'],
  },
  {
    name: 'mock-api',
    type: 'registry:lib',
    title: 'Mock API',
    description:
      'MSW mode: the API contract answered in the browser, with seeded principals and a scripted assistant, so the console runs with no backend (`?msw=1&as=admin|editor|reviewer|viewer|empty`, `?assistant=off`).',
    src: [
      'test/msw/principal.ts',
      'test/msw/init-browser.ts',
      'test/msw/browser.ts',
      'test/msw/handlers.ts',
      'test/msw/agent.ts',
      'test/msw/db.ts',
      'test/msw/findings.ts',
    ],
    extraFiles: [
      {
        path: 'frontend/public/mockServiceWorker.js',
        type: 'registry:file',
        target: '~/public/mockServiceWorker.js',
      },
    ],
    categories: ['blocks'],
  },

  // files
  {
    name: 'design-doc',
    type: 'registry:file',
    title: 'DESIGN.md',
    description: 'The visual and interaction language, and the eight component standards.',
    extraFiles: [{ path: 'frontend/DESIGN.md', type: 'registry:file', target: '~/DESIGN.md' }],
    categories: ['docs'],
  },
  {
    name: 'standards-tests',
    type: 'registry:file',
    title: 'Standards ratchets',
    description:
      'The tests that hold the eight standards: each scans src/ for a shape that breaks one and fails the build on it. They import from vite-plus/test.',
    fileType: 'registry:file',
    devOnly: true,
    src: [
      'app/fold-affordances.test.ts',
      'app/row-status-affordances.test.ts',
      'app/control-affordances.test.ts',
      'app/scale-affordances.test.ts',
      'app/hint-affordances.test.ts',
      'app/mutation-affordances.test.ts',
      'test/source-scan.ts',
    ],
    categories: ['docs'],
  },

  // agent
  {
    name: 'agent-rules',
    type: 'registry:item',
    title: 'Agent skills',
    description:
      'The Claude Code skills that teach a coding agent to build on this framework: add a tool, gate an action behind approvals, expose an action to AI, change the API contract, hold the design standards, and sweep the UI with screenshots. Installs into .claude/skills/.',
    extraFiles: SKILLS.map((skill) => ({
      path: `.claude/skills/${skill}/SKILL.md`,
      type: 'registry:file',
      target: `~/.claude/skills/${skill}/SKILL.md`,
    })),
    categories: ['agent'],
  },
]
