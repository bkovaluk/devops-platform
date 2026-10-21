# Backend: notes for coding agents

FastAPI on Python 3.15, managed with uv. Read `README.md` for the design and
`../CONTRACT.md` for the API. The frontend in `../frontend` consumes
`openapi.json` and `../scope-contract.json`; both are generated, never edited.

## Commands

```bash
uv sync --all-extras
uv run pytest                       # coverage gate 80%
uv run ruff check . && uv run ruff format --check .
uv run mypy platform_api            # strict
uv run python scripts/dump_openapi.py
uv run python scripts/dump_scope_contract.py
uv run uvicorn platform_api.main:app --reload
```

## Rules

- A change to a route, a model, a tool's actions or a seeded role is a contract
  change: regenerate both artifacts in the same change and update
  `../CONTRACT.md` when the shape a person reads changes.
- Every failure is `{"detail": "<one sentence a person can act on>"}`. Raise
  the `ApiError` subclasses in `platform_api/errors.py`; do not raise
  `HTTPException` with ad-hoc payloads. Declare a route's failure statuses
  with the maps at the bottom of `errors.py`.
- Authorization is decided by scopes, never by email or role name in code.
  Single-environment routes depend on `require_scope(tool, action)`; list
  routes use `selected_envs`. Requirements carry the environment as qualifier.
- A change outside `DIRECT_ENVS` is always filed with the approval engine and
  applied only by the tool's registered `replay`. The engine owns the
  two-person rules; tools never re-implement them.
- AI (MCP and the agent) reaches a tool only through the `AiAction`s it
  registers, and an action's `run` calls the same service functions as the
  routes, as the caller. Deciding an approval is never an AI action. Tests use
  Pydantic AI's `FunctionModel`/`TestModel`, never a real model.
- Stores sit behind a protocol with an in-memory and a DynamoDB implementation.
  DynamoDB tests use moto; tests that touch AWS APIs otherwise use
  `botocore.stub.Stubber`. Nothing else in the tests may reach the network.
- Time comes from the injected clock (`platform.clock`), never `datetime.now()`
  inside a service, so tests can move it.
- Tests build apps with `create_app(settings_for(...), verifier=TokenIsEmail(), clock=...)`
  from `tests/conftest.py`; the bearer token is the caller's email.
- Use example.com for every email and domain in code, docs and tests.
