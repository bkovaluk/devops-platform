# MSW mode

An in-browser mock of every route in `../../../../CONTRACT.md`, so the whole UI
runs with no backend. The same handlers answer the unit tests.

## Turning it on

- `?msw=1` on any URL turns it on for the tab (`?msw=0` turns it off), or
- `VITE_USE_MSW=true` in `.env.local` turns it on for every tab.

It never runs in a production build.

## Choosing who you are

`?as=<principal>` picks the principal the mock answers as, and the choice
sticks to the tab. While MSW mode is on, the account menu lists them too.

| Principal  | Person             | Grants                           |
| ---------- | ------------------ | -------------------------------- |
| `admin`    | ada@example.com    | `*`                              |
| `editor`   | lin@example.com    | `flags:read`, `flags:write`      |
| `reviewer` | grace@example.com  | `flags:read`, `approvals:review` |
| `viewer`   | alan@example.com   | `flags:read`                     |
| `empty`    | nobody@example.com | none                             |

The grants come from the seeded roles in `scope-contract.json`.

## What it honours

- Scopes, with the same grammar as the API (`features/auth/permissions.ts`),
  checked per environment.
- `dev` applies writes directly (200); `staging` and `prod` file approval
  requests (202).
- The two-person rule: nobody approves or rejects their own request, rejecting
  needs a note, only the requester withdraws, a pending request older than 72
  hours reads as expired, and an approval whose change no longer applies ends
  `failed` with the reason in `result`.
- `X-View-As: <email>`: admins only, read-only — any write under it is a 403.
- The assistant: `GET /api/agent/status` says enabled, and `POST /api/agent`
  streams AG-UI events from a script. A question is a read (`list_flags`,
  `get_flag` or `list_approvals`) and a short answer; "set checkout-v2 to 75%
  in staging" proposes `update_flag` and ends the run with an interrupt; the
  run that answers it applies the change in `dev`, files an approval request
  elsewhere, or leaves it on cancel. `?assistant=off` turns it off for the tab
  (status disabled, runs 503), `?assistant=on` back on.

## Files

- `principal.ts` — who the mock answers as; no MSW import, so the account menu
  can use it.
- `db.ts` — flags in three environments, approvals in every status, and a
  deterministic hour of evaluations per flag. `resetDb()` starts over; the test
  setup calls it after every test.
- `agent.ts` — the scripted assistant and its `?assistant=` switch.
- `handlers.ts` — the routes. `setLatency(ms)` slows every answer (the browser
  mode uses 120ms so loading states are visible).
- `browser.ts`, `node.ts` — the worker and the test server.
- `init-browser.ts` — boots the worker from `main.tsx` when asked.

When the API changes, change the handler in the same commit as the UI.
