---
name: screenshot-sweep
description: Screenshot the console in MSW mode in both themes at 1440/1024/820/390 and fail on console errors or horizontal overflow. Use before shipping any UI change, when asked to "take screenshots", "check the UI in light and dark", "sweep for overflow", "check mobile widths", or to refresh the README screens.
---

# Screenshot sweep

Tests and Storybook miss font, theme and overflow regressions; the real app in
a real browser does not. `frontend/scripts/screenshots/sweep.ts` drives the
repo's own Playwright against the app in MSW mode (no backend).

## Run it

```bash
cd frontend
bunx playwright install chromium     # once per Playwright version
bun run screenshots                  # starts a dev server on :5199, stops it by PID
```

It writes to `frontend/screenshots/` (git-ignored):

- `<scene>-<theme>.png`: the reference screens at 1440. Home, the all-envs
  list, a flag with its minute popover open, the edit sheet in staging (the
  amber approval submit), the inbox with a diff open, and the assistant as
  `editor` (an answer, a write proposed in staging, the confirmed request).
- `sweep/<width>/<page>-<theme>.png`: every page as `admin` at each width,
  checked for overflow past the viewport.
- `principals/<case>-<page>-<theme>.png`: every page as `?as=viewer`,
  `?as=reviewer`, `?as=empty`, and `?as=admin&assistant=off`.

It exits 1 and lists each problem when a page logs a console error or a page
error, or an element reaches past the viewport outside a container that
scrolls sideways on purpose. Clean, it prints
`No console errors, no overflow.`

Knobs (environment variables): `BASE` (use a server already running in MSW
mode instead of starting one), `PORT` (default 5199), `OUT` (default
`screenshots`), `WIDTHS` (default `1440,1024,820,390`), `THEMES` (default
`dark,light`), `PASSES` (default `scenes,sweep,principals`).
`PASSES=scenes OUT=../docs/screens bun run screenshots` refreshes the README
screens alone.

## Toggles the app understands

- `?msw=1` turns MSW on for the tab (`VITE_USE_MSW=true` for every tab; the
  script sets it on the server it starts).
- `?as=admin|editor|reviewer|viewer|empty` picks the principal; it sticks to
  the tab. The grants are the seeded roles in `scope-contract.json`.
- `?assistant=off` (and `?assistant=on`) hides or restores the assistant.
- The theme is the `platform-ui` entry in `localStorage`
  (`{"state":{"theme":"dark"|"light"}}`); the script seeds it per context.

## Then look

Open the PNGs and read them: a passing run proves only the absence of errors
and overflow. In both themes look for a truncated wordmark or key, mono text
heavier than the sans beside it, clipped popovers, the amber approval submit
outside `dev`, and the assistant dock at 1440. Judge against the
`design-standards` skill.

## Servers

The script stops the server it started by its process-group PID. A server you
started yourself is yours to stop, by PID:

```bash
kill $(lsof -ti tcp:5173)            # never pkill or killall by name
lsof -ti tcp:5199 || echo stopped    # confirm nothing is left on the port
```

## Adding a scene

Add an entry to `SCENES` in `sweep.ts` (name, principal, path, and an `act`
that drives the page with role-based locators), or a path to `PAGES` to cover
it in the width sweep and the principals pass. Role-based locators make the
script fail loudly when an accessible name changes.
