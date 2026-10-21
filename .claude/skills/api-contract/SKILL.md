---
name: api-contract
description: Change the API contract between backend and frontend safely. Use when adding or changing a route, a request or response model, a scope, a role or an approval action, when asked to "change the API", "add a field", "update CONTRACT.md", "regenerate the types", or when `check-api-types`, `check-scope-contract` or `tests/test_contracts.py` fails.
---

# Change the API contract

One agreement in three forms: `CONTRACT.md` (for people), `backend/openapi.json`
(for machines, generated from the code) and `scope-contract.json` (the scope
vocabulary, the seeded roles and conformance cases, read by both halves). The
frontend's copies are generated too: `frontend/src/types/api-generated.ts` and
`frontend/src/features/auth/scope-contract.json`. Never edit a generated file
by hand, and change all of them in one change.

## Steps

1. **Write the contract first.** Edit `CONTRACT.md`: the shape a person reads,
   the statuses (200 applied, 202 filed for approval, 400/401/403/404/409/422/
   502 with `{"detail": "<one sentence>"}`), and the env rules (`env=all` only
   on list routes).
2. **Backend.** Change the Pydantic models and routes under
   `backend/platform_api/`. Scopes live in `TOOL_ACTIONS` (`auth/scopes.py`),
   roles in `SEEDED_ROLES` (`auth/roles.py`). Declare every failure status with
   the maps at the bottom of `errors.py`. When paths change, update the
   expected set in `tests/test_contracts.py::test_openapi_covers_the_contract`.
3. **Dump the artifacts:**
   ```bash
   cd backend
   uv run python scripts/dump_openapi.py          # backend/openapi.json
   uv run python scripts/dump_scope_contract.py   # ../scope-contract.json
   ```
4. **Regenerate the frontend's copies:**
   ```bash
   cd frontend
   bun run generate-api-types
   bun run generate-scope-contract
   ```
   `generate-api-types` runs openapi-typescript with
   `scripts/api-types/typescript5.ts` preloaded, which hands it `typescript5`
   (TypeScript 5.9 under an npm alias). The repo type-checks with TypeScript
   7, which has no compiler API; never downgrade `typescript` to fix a crash.
5. **Fix the drift.** Re-export new schemas from `src/types/api.ts`, then let
   the checks point at every consumer: `bun run typecheck` for moved shapes,
   `src/features/auth/permissions.test.ts` for the scope vocabulary (extend
   `Tool` / `Action` in `src/features/auth/permissions.ts`). Make the MSW
   handlers and fixtures (`src/test/msw/handlers.ts`, `db.ts`) answer on the
   API's new terms, and update `src/test/msw/README.md` if behaviour changed.
6. **Run both verify chains.** Both must be clean.

## Verify

```bash
cd backend && uv sync --all-extras && uv run ruff check . && uv run ruff format --check . \
  && uv run mypy platform_api && uv run pytest -q
cd frontend && bun run check-api-types && bun run check-scope-contract && bun run registry:build \
  && bun run typecheck && bun run lint && bun run format:check && bun run test && bun run build
```

What catches a half-done change:

- `backend/tests/test_contracts.py`: a stale `openapi.json` or
  `scope-contract.json`, or a path set that differs from the contract.
- `bun run check-api-types`: `api-generated.ts` differs from what
  `openapi.json` generates (openapi-typescript `--check`).
- `bun run check-scope-contract`: the frontend copy differs from
  `../scope-contract.json` (a `git diff`, so it bites once the copy is
  committed).
- `src/features/auth/permissions.test.ts`: the contract's tools, actions,
  roles or refusal cases disagree with the frontend's scope grammar.
