# DESIGN.md

The visual and interaction language. Read it before building UI so a new
surface reads as the same product. Pairs with `CLAUDE.md`.

## Direction

**Precision dark tooling**: a calm, near-black console for operating services,
command-driven and status-first. Premium and intentional, never a default
template. Calm by default; power revealed on demand.

Principle: **confidence over complexity.** Every surface reduces ambiguity
about _what state things are in_ and _what will happen if I act_.

## Component standards

Eight rules that make every tool read as the same app. All eight are in force,
and the tests in `src/app/*-affordances.test.ts` refuse drift:

- `fold-affordances` — hand-written folds (rule 1)
- `row-status-affordances` — veils, inset selection bars, raw state colour,
  hand-picked env colour (rules 4, 5)
- `control-affordances` — call-site button heights, icon-sized `Button`s, raw
  shimmers and spinners (rules 6, 7)
- `scale-affordances` — arbitrary text under 18px, `rounded-2xl`, pixel
  gutters, heavy shadows (rule 8)
- `hint-affordances` — native `title`, stray tooltips (a tooltip primitive
  imported, or a `role="tooltip"` drawn by hand), `toBeEnabled`
- `mutation-affordances` — mutations out of the view-as guard's reach (on a
  bare `<button>`, a `MenuItem` or a palette item)

1. **Everything that collapses looks collapsible.** A section is `Fold`, a row
   that opens in place is `FoldRow`, "+N more" is `ShowMore`
   (`components/ui/fold`). The chevron sits on the left and turns, never swaps.
   A dashed rule says "this folds" before it is touched, a dashed guide says
   "this is open". A row's own controls sit in `FoldRow`'s `actions`, never in
   its trigger. Bodies stay mounted, `hidden`, so find-in-page reaches them.
2. **A section head looks like a section head.** Every head is
   `SectionHeader`: `layout="page"` for a section of a page (display 15px, a
   reading in mono nano on the right), `layout="pane"` inside a pane or sheet
   (caps label with a hairline to the edge), `pane danger` for a danger zone.
   Sections sit `SECTION_GAP` (24px) apart, a head `SECTION_HEAD_GAP` (12px)
   above its body; neither head has a margin of its own.
3. **Caps means a section starts here.** `uppercase-label` for section heads,
   `column-label` for column heads, `field-label` (sentence case, 12px medium,
   muted) for form, `dt` and stat labels. Counts, chips, state words and menu
   items never wear caps.
4. **One row recipe.** Lists live on `ListCard`; a row is `ListCard.Surface`:
   `size` sets its floor at 40, 48 or 56px with 16px sides, `interactive`
   gives it the solid `bg-accent` hover, `selected` draws the one selection
   mark (`SELECTED_ROW`: accent fill plus the signal bar). Expanded is not
   selected.
5. **Status, env and counts each have one look.** Health is a `StateMark`
   (8px, 6px in dense rows); a status word is a `Chip` (`tone`, `soft` for a
   fill); an environment is an `EnvSignal`; a count wears `count` (mono nano,
   tabular, dim). State colour comes only from the `state-*` tokens; tool
   identity only from `TOOL_ACCENTS`; env colour only from `lib/env.ts`.
6. **Buttons: one primary, clear consequences, two heights.** One ink
   primary per task, `soft` secondaries, and the consequence tier:
   `glass-amber` (files an approval, always with `GitPullRequest`),
   `glass-rose` (confirms a destruction), `glass-emerald` (the selected lens),
   `danger` (opens a destructive confirm). Heights come from `size` — `xs` 28,
   `sm` 32 in toolbars, `default` 40 in forms — never a class. An icon alone is
   an `IconButton` whose `label` is its name and its hint. Any other `Button`
   explains itself, or why it is disabled, through `hint`. A copy is
   `CopyButton`.
7. **Empty, loading and error: three components.** `EmptyState`, `Skeleton`
   and `ErrorState` ("Couldn't load {noun}", a detail, one soft Retry), each in
   `page`, `inspector` and `inline` sizes. No spinners.
8. **One spacing and type scale.** Gutters are tokens: `px-gutter-page` (24),
   `px-gutter-list` (16), `px-gutter-pane` (20). Type has seven steps:
   `text-nano` 11, `text-xs` 12, `text-label` 13, `text-sm` 14,
   `text-heading` 15, `text-base` 16, `text-title` 17; display sizes of 18px
   and up may be arbitrary and are rare. A box of fields is a `Panel`
   (`well`, `card`, `framed`) at `rounded-lg`; a list card is `rounded-xl`;
   nothing is `rounded-2xl`. Shadows only on the framed panel and overlays
   (`shadow-workspace`, `shadow-overlay`).

## Colour

- Tokens live in `src/index.css`. Use utilities (`bg-panel`, `text-foreground`)
  or `var(--…)`, never raw hex in components.
- The dark ramp is **ink-blue**: hue ~268°, chroma .02–.04 held on every step
  (`--background` → `--card` → `--panel` → `--well` → `--accent` →
  `--muted`). Tone is the structure; if the chroma drains the app reads grey.
- The light ramp is **paper**: the same hue at low chroma, order inverted —
  chrome one step darker than the work, so the columns read as lit paper on a
  tinted desk.
- Hover and selected fills are **solid**, never a translucent veil.
- **Tone establishes hierarchy; one separator clarifies a boundary.** The list
  column is `--card`, the detail column `--panel`, and exactly one seam,
  `--shell-separator`, divides them. `--border` is for overlay edges and the
  inside of a `ListCard`.
- **Signal** (`--signal`): selection marks, focus, the segmented whisper, the
  open bucket of a chart. One token per theme, because a text boost cannot
  reach a `bg-*`.
- **State** (`--state-ok|warn|bad|unknown|info` with `-fill`): the only
  source of "how is this doing". Colour is the only thing these say, so
  anything load-bearing pairs them with a word, a glyph or a rail.
- **Environments** have their own family: dev green, qa sky, staging violet,
  prod rose, any other name neutral (`--env-other`). Health colours are never an
  environment's. Environment presence is explicit language in stable places:
  the switcher ("Prod · Live"), the banner under the top bar
  ("staging · writes require approval"), "read-only" beside the all-envs scope,
  and the env named on every write button.
- **Data ink** (`--data-ink`, `--data-ink-strong`): the neutral a chart draws
  an ordinary reading in, and the column under the pointer.
- Wide-gamut displays get an OKLCH layer with the same hue and lightness and
  slightly more chroma.

## Typography

**Mona Sans** for text, **Hubot Sans** (`font-display`) for headings, and
**Martian Mono** (`font-mono`) for resource names, values and counts (always
tabular). The wordmark is Hubot Sans at full width and bold
(`font-display font-stretch-125%`), 14px in the rail; nothing else sets the
display face wide. Hierarchy comes from scale, not weight. Headings balance,
paragraphs wrap pretty. The reading floor is 12px; 11px (`text-nano`) is
reference-only — counts, keys, timestamps, column heads.

Martian Mono is wide with a tall x-height, so mono is set on its narrow width
(`--font-mono--font-variation-settings`, `wdth` 87.5) and a step under the sans
beside it: a resource name in a row (`.mono`) is 12px beside 13px text, a
fact's value 14px, a minute's reading 12px, the detail title 15px. Caps labels
are weight 500 and track at 0.06em (section heads) and 0.02em (column heads).
Counts, chips, env names and axis labels stay at `text-nano`.

## Surfaces and depth

The shell is two surfaces told apart by shape: the **chrome** — rail and top
bar as one continuous L on `--surface-chrome` — and the **workspace** inset
into it (`--workspace-inset`, `--workspace-radius`, a decorative edge and a
soft lift), the app's one `<main>`. The assistant dock is a second inset panel
beside it, 400px wide, that closes on Escape: the person's words sit on the
accent fill, the assistant's read as plain text, each read is a dense
`FoldRow`, and each proposed change is a framed card with its diff and the same
confirm the sheets use (amber "Request approval for {env}" outside the direct
envs). Below `md` the inset, radius, edge and lift go to zero together.
Glass (`.glass`) is for overlays only: dialogs and the command palette.

## Primitives

Behaviour that is hard to get right sits on **Base UI** (`@base-ui/react`):
Dialog under `Dialog`, `Sheet`, the command palette and the rail's mobile
drawer (focus trap, Escape, focus return); Collapsible under `Fold` and
`FoldRow`; Switch; Toast under `Toaster`; `useRender` for `asChild`. The eight
standards are the API a surface uses; Base UI is what sits under them, styled
only through our tokens.

**Anchored and non-modal means native.** A hint, an `InfoTip`, a menu
(`components/ui/menu`) and a strip's minute popover are native popovers
(`popover="manual"` when the owner decides when it closes, `"auto"` for light
dismiss), placed with CSS anchor positioning (`lib/popover.ts`): `anchor-name`
on the trigger, `position-anchor` and `position-area` on the popover, a margin
for the gap, and `position-try-fallbacks` — the other side, then the
`@position-try` slides in `index.css` — when there is no room. They live in
the top layer, so no portal, no z-index and no clipping ancestor; a browser
without anchor positioning gets the same placement measured as it opens. A
menu walks with the arrows, Home and End, jumps by letter, closes on Escape,
Tab or a press outside, and hands focus back to its trigger.

## Motion

Timings are CSS tokens (`--duration-fast` 120ms, `--duration` 200ms,
`--duration-slide` 220ms, `--ease-standard`, `--ease-slide`); there is no
animation library. Animate transform, translate, scale, opacity and clip-path.

- **Entries** come from `@starting-style` (Tailwind's `starting:`): overlays
  fade, dialogs settle from 95%, sheets and the drawer slide in, a fold's body
  drops 4px, the copy check grows.
- **Exits:** Base UI overlays leave through `data-ending-style`, which holds
  them mounted until the transition ends; native popovers fade with
  `transition-behavior: allow-discrete` on `display` and `overlay`.
- **The segmented pill** is one element anchored to the checked option, so a
  new choice slides it across.
- **Route changes** that swap a list's detail, or the inbox's lens, pass
  `viewTransition` to the router and swap only the pane (`TRANSITION_PANE`):
  the old reading fades, the new one rises 4px. The environment and the theme
  crossfade the whole page through `withViewTransition`.
- **Reduced motion** is handled once, in the CSS catch-all: transitions and
  entries collapse to an instant and view transitions swap without animating.

## Interaction

- **Keyboard first.** ⌘K / Ctrl+K opens the palette; digits open tools in rail
  order; charts hold one tab stop and the arrows walk their buckets.
- **URL is state.** Filters, search, the open sheet, the selected request: all
  validated search params, so every view is a link.
- **Don't mis-target.** The target env is captured when a sheet opens and named
  on its submit. Dirty sheets ask before discarding.
- **Approval flow surfaced before submit:** amber callout, `GitPullRequest`,
  "Request approval for {env}". Never optimistic for approval-routed writes.
- **Approve is one press** in the inbox — reviewing is what the inbox is for.
  Reject opens its note, which is required. Withdraw is the requester's.

## Hints

Every hint comes from `components/ui/hint.tsx`, both kinds native popovers
anchored to their trigger. `Hint` names a control in a few words on hover or
keyboard focus, describes it to a screen reader while shown, and goes on
Escape before anything under it hears the key (a disabled control it explains
stays reachable through `aria-disabled`). `InfoTip` hands over the sentence
behind a word on a press and stays until put away. No native `title`, anywhere: `Button`,
`IconButton` and `Chip` take a `hint`.

## Facts

A fact on a row or a chip is one word in sentence case, optionally beside one
value: "On · 25%", "Pending", "Expired". The sentence behind it lives in a
hint, a disclosure or a body, never on the row.

## The quiet-columns chart

Every bar chart is `MetricTrack`; a reading that is a row is `MetricStrip`, the
same columns at row height. A column is a thin, flat stroke of data ink about
half its slot with a 1px rounded top — no gradient, glow or shadow. It takes
colour only when the reading went wrong (`--state-warn`, `--state-bad`), and
failures hang in their own lane under the baseline on their own scale. The
bucket held open is a 1px signal outline. Numbers sit on one right-aligned mono
line over the chart: the bucket under the pointer, else the open one
("Open · …"), else the window's totals. A bucket with no reading is a dotted
stub on the baseline, never a short column; a moment worth marking is a 1px
hairline with a dot on top. Pressing a minute of a strip opens its popover
against the column (`app/flags/EvaluationStrip.tsx`); Escape or a press outside
closes it and hands the keyboard back.

## Anti-patterns

- Inline palette colour for a tool, a state or an env.
- Env as a loud badge; badge spam in rows.
- Glass everywhere; default component-library looks passed off as finished.
- One-click destructive or prod writes without a confirm.
- A row that carries a sentence, or a fragment joined with " · ".

## Checklist before shipping a surface

- [ ] Colour, motion and accents read from tokens
- [ ] Hierarchy from scale; calm default, detail on demand
- [ ] Designed hover, focus, active, loading, empty and error states
- [ ] Keyboard reachable; visible focus outline
- [ ] Destructive and approval-routed actions say what will happen first
- [ ] Respects reduced motion
- [ ] Checked in both themes at 1440 and below `md`
