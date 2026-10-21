---
name: design-standards
description: The console's design system and how to review UI against it. Use when building or reviewing any frontend surface, when asked to "make it match the design", "review this UI change", "which component do I use for...", or when an `*-affordances.test.ts` ratchet fails.
---

# Design standards

`frontend/DESIGN.md` is the source; read it before authoring a surface. This
is the working summary and the review procedure.

## The eight component standards

1. **Collapsible looks collapsible.** `Fold`, `FoldRow`, `ShowMore` from
   `src/components/ui/fold`. Chevron left, turns. Row controls go in
   `FoldRow`'s `actions`, never its trigger. Bodies stay mounted, `hidden`.
2. **Section heads.** `SectionHeader` only: `layout="page"`, `layout="pane"`,
   `pane danger`. Sections sit `SECTION_GAP` apart, heads `SECTION_HEAD_GAP`
   above their body; heads carry no margin.
3. **Caps means a section starts.** `uppercase-label` (section heads),
   `column-label` (column heads); `field-label` (sentence case) for form, `dt`
   and stat labels. Counts, chips, state words and menu items never in caps.
4. **One row recipe.** `ListCard` with `ListCard.Surface` (`size` 40/48/56,
   `interactive`, `selected` draws `SELECTED_ROW`). Expanded is not selected.
5. **Status, env, counts.** `StateMark`, `Chip` (`tone`, `soft`),
   `EnvSignal`, `count`. Colour only from the `state-*` tokens,
   `TOOL_ACCENTS` and `lib/env.ts`.
6. **Buttons.** One ink primary per task, `soft` secondaries, and the
   consequence tier: `glass-amber` (files an approval, with `GitPullRequest`),
   `glass-rose`, `glass-emerald`, `danger`. Heights only through `size` (`xs`
   28, `sm` 32, `default` 40). An icon alone is an `IconButton` with `label`.
   Every other `Button` explains itself, or why it is disabled, with `hint`.
   A copy is `CopyButton`.
7. **Empty, loading, error.** `EmptyState`, `Skeleton`, `ErrorState`, each in
   `page`, `inspector` and `inline` sizes. No spinners.
8. **Scale.** Gutters `px-gutter-page` 24, `px-gutter-list` 16,
   `px-gutter-pane` 20. Type steps `text-nano` 11, `text-xs` 12, `text-label`
   13, `text-sm` 14, `text-heading` 15, `text-base` 16, `text-title` 17;
   arbitrary sizes only at 18px and up. `Panel` at `rounded-lg`, list cards
   `rounded-xl`, never `rounded-2xl`. Shadows only `shadow-workspace` and
   `shadow-overlay`.

## Tokens and fonts

- Colours are tokens in `src/index.css` (`bg-panel`, `text-foreground`,
  `var(--…)`), never raw hex in a component. Hover and selected fills are
  solid, never a translucent veil.
- Fonts load once in `src/fonts.ts`: Mona Sans (`--font-sans`), Hubot Sans
  (`--font-display`), Martian Mono (`--font-mono`, on its narrow width). The
  wordmark is `font-display font-stretch-125%`. Mono runs a step under the
  sans beside it: `.mono` is 12px. A new pairing is `fonts.ts`, the `--font-*`
  tokens and `package.json`.

## Popovers and primitives

- Modal overlays are `Dialog`, `Sheet` and the command palette (Base UI). No
  bespoke modal.
- Anchored and non-modal is native: hints, `InfoTip`, `components/ui/menu` and
  the minute popover are the Popover API placed with CSS anchor positioning
  through `src/lib/popover.ts`. No portals, no z-index, no positioning library.
- Toasts go through `lib/toast.ts`, `notifyWithLink` or `notifyFailure`.

## Motion

No animation library. Entries are `@starting-style` (`starting:`); Base UI
overlays leave through `data-ending-style:`; native popovers leave with
`.popover-motion`. A list-to-detail or inbox-lens navigation passes
`viewTransition` and the swapped pane carries `TRANSITION_PANE`; env and theme
swaps go through `withViewTransition`. Timings are the `--duration*` and
`--ease-*` tokens. Animate transform, opacity and clip-path only. Reduced
motion is the CSS catch-all in `index.css`; add no per-component check.

## What the ratchets catch (`src/app/*-affordances.test.ts`)

- `fold-affordances`: a fold drawn by hand instead of `Fold` or `FoldRow`.
- `row-status-affordances`: a translucent hover veil, an inset-shadow
  selection bar, raw state colour, env colour not from `lib/env.ts`.
- `control-affordances`: `h-*` on a `Button` at the call site, an icon-sized
  `Button` (use `IconButton`), a hand-made shimmer or spinner.
- `scale-affordances`: arbitrary text under 18px, `rounded-2xl`, pixel
  gutters, any shadow but the overlay and workspace ones.
- `hint-affordances`: native `title=`, an imported tooltip or a hand-drawn
  `role="tooltip"`, a test asserting `toBeEnabled` (use `toBeActionable`).
- `mutation-affordances`: a mutation wired to a control the view-as guard
  cannot reach (a bare `<button>`, a `MenuItem`, a palette item). Put it on a
  `Button` marked `mutates`, or a submit.

`src/features/auth/no-direct-use-mutation.test.ts` and the lint rule behind it
refuse `useMutation`; every mutation is `useIdentityBoundMutation`.

## Review a UI change

1. Read the diff against the eight standards, line by line. A hand-made fold,
   head, row, chip, button height, empty or loading state is a finding.
2. Colour, accents and env colour come from tokens, `TOOL_ACCENTS` and
   `lib/env.ts`. A fact on a row is one word, optionally beside one value;
   the sentence behind it lives in a hint.
3. Writes: the target env is captured when the sheet opens and named on the
   submit. Outside a direct env the submit is `glass-amber` with
   `GitPullRequest`, reads "Request approval for {env}", and sits under an
   amber callout.
4. Run the ratchets and the checks:
   ```bash
   cd frontend && bun run test && bun run lint && bun run typecheck && bun run format:check
   ```
5. Run the `screenshot-sweep` skill and look at both themes at 1440 and 390.
   Tests and Storybook do not see a font, overflow or theme regression.
