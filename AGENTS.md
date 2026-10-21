# Notes for coding agents

Two halves and one contract:

- `backend/`: FastAPI on Python 3.15 with uv. Read `backend/CLAUDE.md`.
- `frontend/`: React 19 on Vite+ with Bun. Read `frontend/CLAUDE.md`, and
  `frontend/DESIGN.md` before any UI.
- `CONTRACT.md`: the API both halves agree on. `backend/openapi.json` and
  `scope-contract.json` are generated from the backend and copied into the
  frontend; never edit a generated file.

## Skills (`.claude/skills/`)

| Skill                 | Use it to                                                      |
| --------------------- | -------------------------------------------------------------- |
| `add-tool`            | add a tool end to end, backend and frontend                    |
| `add-approval-action` | gate an action behind the two-person rule on both halves       |
| `ai-actions`          | expose an action to MCP and the assistant                      |
| `api-contract`        | change a route, model, scope or role and regenerate everything |
| `design-standards`    | build or review UI against the eight standards                 |
| `screenshot-sweep`    | screenshot both themes at four widths, catch errors, overflow  |

## Verify

```bash
cd backend && uv sync --all-extras && uv run ruff check . && uv run ruff format --check . \
  && uv run mypy platform_api && uv run pytest -q
cd frontend && bun run registry:build && bun run check-api-types && bun run typecheck \
  && bun run lint && bun run format:check && bun run test && bun run build
```

Use `example.com` for every email and domain. Stop a server you started by its
PID (`lsof -ti tcp:<port>`), never by name.
