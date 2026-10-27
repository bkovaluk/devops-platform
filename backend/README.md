# Backend

FastAPI service behind the DevOps Platform UI. It gives every tool the same
frame: per-environment resources, scope-based permissions, an admin "view as",
and a two-person rule for every change outside the direct environments.
Feature flags are the example tool.

The API is specified in [`../CONTRACT.md`](../CONTRACT.md) for people and in
[`openapi.json`](openapi.json) for machines. The permission grammar is exported
to [`../scope-contract.json`](../scope-contract.json).

## Run locally

Requires [uv](https://docs.astral.sh/uv/) and Python 3.15.

```bash
uv sync --all-extras
uv run uvicorn platform_api.main:app --reload --port 8000
curl localhost:8000/health
curl 'localhost:8000/api/flags?env=all'
```

Out of the box the service runs with `AUTH_MODE=dev` (every request is
`ada@example.com`, an admin) and an in-memory store seeded with eight example
flags per environment and two pending approval requests filed by other people,
so the approval flow can be tried end to end. Interactive docs are at
`/docs`. Copy `.env.example` to `.env` to change anything.

```bash
uv run pytest                    # tests, coverage must stay >= 80%
uv run ruff check . && uv run ruff format --check .
uv run mypy platform_api
uv run python scripts/dump_openapi.py         # after changing a route or model
uv run python scripts/dump_scope_contract.py  # after changing scopes or roles
```

`tests/test_contracts.py` fails when either generated file is stale, so CI
catches a contract change that was not regenerated.

### Docker

```bash
docker build -t devops-platform-api .
docker run -p 8000:8000 devops-platform-api
```

## Configuration

All settings are environment variables; `.env.example` lists every one.

| Setting | Default | Meaning |
|---|---|---|
| `ENVIRONMENTS` | `dev,staging,prod` | Environments, lowest to highest |
| `DIRECT_ENVS` | `dev` | Where changes apply without approval |
| `AUTH_MODE` | `dev` | `dev` or `oidc` |
| `ROLE_BINDINGS` | `{}` | `{"email": ["role", ...]}` |
| `DEFAULT_ROLES` | `viewer` | Roles for anyone not bound |
| `CUSTOM_ROLES` | `{}` | `{"role": ["scope", ...]}` beside the seeded roles |
| `APPROVAL_TTL_HOURS` | `72` | A pending request older than this reads as `expired` |
| `STORE` | `memory` | `memory` or `dynamodb` |
| `DYNAMODB_TABLE` | `devops-platform` | Table used when `STORE=dynamodb` |
| `AWS_ROLE_ARNS` | `{}` | Optional `{"env": "role arn"}` for cross-account tools |
| `FINDINGS_TABLES` | `{}` | `{"env": "table"}`: the DevOps agent's findings table per env; an env left out reads `devops-agent-findings-<env>` |
| `AGENT_MODEL` | unset | Pydantic AI model string for the assistant; unset turns it off |

## Auth

**`AUTH_MODE=dev`** accepts every request as `DEV_USER_EMAIL` holding
`DEV_USER_ROLES`. Never deploy it.

**`AUTH_MODE=oidc`** verifies `Authorization: Bearer <ID token>` against
`OIDC_ISSUER`, `OIDC_AUDIENCE` and the keys at `OIDC_JWKS_URL`. Setting
`OIDC_HOSTED_DOMAIN` additionally requires Google's `hd` claim, which confines
a Google sign-in to one Workspace domain. Any OIDC provider works; to add a
different kind of verifier, implement `TokenVerifier` in
`platform_api/auth/providers.py` and return it from `build_verifier`.

### Scopes and roles

A scope is `<tool>:<action>[:<env>]`. Grants may use `*` (everything) or
`<tool>:*` (every action of one tool). An unqualified grant covers every
environment; `flags:write:dev` covers dev only.

| Role | Scopes |
|---|---|
| `viewer` | `flags:read`, `findings:read` |
| `editor` | `flags:read`, `flags:write`, `findings:read`, `findings:review` |
| `reviewer` | `flags:read`, `approvals:review`, `findings:read` |
| `admin` | `*` |

Routes about one environment check the scope qualified with it, so
`flags:write:dev` opens `PUT /api/flags/{key}?env=dev` and nothing else.
`env=all` lists every environment the caller can read.

### View as

An admin may send `X-View-As: <email>` to see exactly what that person sees:
`/auth/me` and every read answer with their scopes, and `view_as` names them.
Requests under view-as are read-only.

## Approvals

Outside `DIRECT_ENVS`, a change is not applied: it is filed as an approval
request carrying the change (`payload`) and the item as it was (`before`).
Someone else holding `approvals:review` in that environment approves or
rejects it. Approving replays the stored change through the tool that filed
it; the request ends `approved` with `result` saying what was done, or
`failed` with `result` saying why (for flags, a flag that changed since the
request was filed is not overwritten). The rules, the same for every tool:

- the requester can never approve or reject their own request, only withdraw it;
- rejecting requires a note;
- only pending requests can be decided; one older than `APPROVAL_TTL_HOURS`
  reads as `expired`;
- one pending request per item at a time.

## Investigations

`platform_api/tools/findings/` serves the review side of an alarm-investigating
DevOps agent, which writes one finding per investigation to a DynamoDB table in
each environment. The routes are in `../CONTRACT.md`; reads take
`findings:read` and reviews `findings:review` in the finding's env.

With `STORE=dynamodb` each env's table (`FINDINGS_TABLES`, default
`devops-agent-findings-<env>`) is read through that env's client from
`platform_api.aws.get_boto3_client`, so a table in another account is reached
with its `AWS_ROLE_ARNS` role. The table has the hash key `pk` and the GSIs
`by_status` (`status`, `created_at`) and `by_resource` (`resource_key`,
`created_at`), both projecting all attributes. A list is one `by_status`
query over the window per env, capped at 5,000 items; the table is never
scanned. The role needs `dynamodb:GetItem` and `UpdateItem` on the table and
`Query` on its indexes. A review writes only `status`, `acknowledged_at`,
`acknowledged_by`, `resolution`, `resolution_note`, `resolved_at`,
`resolved_by` and `ttl` on `finding#<id>`, and `ttl` on its `snap#<id>`, so the
role can be held to those attributes with a `dynamodb:Attributes` condition.
With `STORE=memory` the tool runs on example findings.

Reviews apply at once in every environment and are never filed with the
approval engine: they record a verdict on the agent's own record and change
nothing the finding is about. Acknowledging sets `ttl` to 90 days from then;
closing sets it to 365 days on the finding and on its eval snapshot, as the
agent's retention contract says. `confirmed` and `false_positive` grade a
reported cause and become the agent's memory of the resource; `wrong` needs a
note; `dismissed` closes a finding that reported none.

## AI: MCP and the assistant

Both act as the signed-in principal, with the same bearer token, scopes,
view-as and approval rule as the API; neither has rights of its own. What they
can do is what tools declare as AI actions (`platform_api/ai/actions.py`):
flags expose `list_flags`, `get_flag`, `get_flag_evaluations`, `update_flag`,
`create_flag` and `delete_flag`; approvals expose `list_approvals` and
`get_approval`. Approving or rejecting is never an AI action. Each action
calls the same service functions as the routes, and every call is logged once
(`ai.call`, with principal, action, env and outcome; never other arguments).
Under view-as only read actions are offered or run.

**MCP** is served at `/mcp` (streamable HTTP, stateless, JSON responses) by
FastMCP. `tools/list` returns only the actions the caller's scopes allow in at
least one environment. A write applies in a direct environment and otherwise
files an approval request and returns it.

```bash
curl -s localhost:8000/mcp -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' -H 'Authorization: Bearer dev' \
  -d '{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}'
```

**The assistant** is `POST /api/agent`, an AG-UI endpoint (Server-Sent
Events) backed by a Pydantic AI agent, on when `AGENT_MODEL` is set. Reads
run at once. A write ends the run with an interrupt whose `metadata` is the
change (`tool`, `env`, `target`, `before`, `after`); the client resumes with
the thread's messages and `resume: [{interruptId, status: "resolved",
payload: {approved: true}}]` to confirm, or `status: "cancelled"` to cancel.
A confirmed change goes through the normal path. `GET /api/agent/status`
says whether it is on. Tests drive it with Pydantic AI's `FunctionModel`.

## Add a tool

A tool is a package under `platform_api/tools/` with an `install(app, platform)`
function. Using a hypothetical `widgets` tool:

1. **Scopes.** Add its actions to `TOOL_ACTIONS` in
   `platform_api/auth/scopes.py`, e.g. `"widgets": ("read", "write")`. Include
   `read`: the approval queue shows a request to whoever can read its tool in
   its environment. Grant the new scopes in `SEEDED_ROLES`
   (`platform_api/auth/roles.py`) or through `CUSTOM_ROLES`.
2. **Store, service, routes.** Follow `tools/flags/`: a small store protocol
   with an in-memory and a DynamoDB implementation, a service, and a router
   whose single-item routes depend on `require_scope("widgets", "<action>")`
   and whose list route uses `selected_envs` and `fan_out` from
   `platform_api/envs.py`. Raise the errors in `platform_api/errors.py` with a
   sentence the user can act on.
3. **Approval actions.** In `install`, register the actions the tool files and
   the function that applies an approved one:

   ```python
   platform.approval_registry.register(
       ApprovalHandler("widgets", frozenset({"create", "update"}), service.replay)
   )
   ```

   File a change with `platform.approvals.file(...)` when the environment is not
   direct. `replay(approval)` returns a sentence describing what it did, or
   raises an `ApiError` (or anything else) to mark the request `failed`.
4. **AI actions (optional).** In `install`, register what a model may do with
   the tool as `AiAction`s whose `run` calls the service as the route does
   (see `tools/flags/ai.py`); a write also needs a `preview` of the change for
   the person asked to confirm it. Nothing is exposed by default.
5. **Turn it on.** Add `widgets.install` to `INSTALLERS` in
   `platform_api/tools/__init__.py`.
6. **Regenerate** `openapi.json` and `scope-contract.json` and commit both.

If the tool calls AWS in per-environment accounts, use
`platform_api.aws.get_boto3_client(service, env)` with `AWS_ROLE_ARNS` set.

## DynamoDB

`STORE=dynamodb` keeps flags and approvals in one table (the DevOps agent's
findings live in its own tables, see Investigations) with string keys
`pk` (partition) and `sk` (sort); on-demand billing is fine:

```bash
aws dynamodb create-table --table-name devops-platform \
  --attribute-definitions AttributeName=pk,AttributeType=S AttributeName=sk,AttributeType=S \
  --key-schema AttributeName=pk,KeyType=HASH AttributeName=sk,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST
```

Flags live under `pk = FLAG#<env>`, approvals under `pk = APPROVAL`. The
service needs `dynamodb:GetItem`, `PutItem`, `DeleteItem` and `Query` on the
table. The DynamoDB store starts empty; example data is seeded only in memory.

## Layout

```
platform_api/
  app.py            create_app(): settings, auth, approvals, tools
  main.py           ASGI entry point
  config.py         Settings
  errors.py         {"detail": ...} error contract and OpenAPI error maps
  log.py            JSON logging and request logging
  envs.py           env selection, access checks, fan-out
  aws.py            optional cross-account boto3 clients
  storage.py        shared DynamoDB helpers
  artifacts.py      renders openapi.json and scope-contract.json
  auth/             providers, scopes, roles, view-as, dependencies, contract export
  approvals/        engine, registry, store, models, visibility, AI actions
  ai/               AI action registry, MCP server, assistant agent and its routes
  routes/           /health, /config, /auth/me, /api/approvals
  tools/flags/      the example tool
scripts/            dump_openapi.py, dump_scope_contract.py
tests/
```
