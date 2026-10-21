# API contract

The one agreement between `backend/` (FastAPI) and `frontend/` (React). The backend's
`openapi.json` is generated from the code and is the machine source of truth; this file is
the human one. Change both together.

## Conventions

- Base path `/api`. JSON in and out. Times are ISO 8601 UTC strings.
- Every resource lives in an environment. Environments come from configuration
  (`ENVIRONMENTS`, default `dev,staging,prod`); `dev` is the only one where a change applies
  directly. In every other environment a change becomes an approval request.
- `env=all` on a list route fans out across every environment the caller may read and
  tags each item with `env`. Routes about one item take a single env; `all` is a 400.
- Errors: `{"detail": "<one sentence a person can act on>"}` with 400, 401, 403, 404, 409,
  422 or 502 (upstream failure).
- Auth: `Authorization: Bearer <token>`. Locally the backend runs with `AUTH_MODE=dev` and
  accepts any request as the configured dev user; MSW does the same in the frontend.

## Identity and permissions

`GET /auth/me`
```json
{ "email": "ada@example.com", "name": "Ada", "scopes": ["flags:read", "flags:write", "approvals:review"],
  "is_admin": false, "view_as": null }
```
Scopes are `<tool>:<action>[:<qualifier>]`; `*` grants everything. The scope vocabulary,
the seeded roles and conformance cases live in `scope-contract.json` at the repo root,
read by both halves.

`X-View-As: <email>` (admins only) answers as another principal; `view_as` then names them.

## Configuration

`GET /config`
```json
{ "app_name": "DevOps Platform", "environments": ["dev", "staging", "prod"], "direct_envs": ["dev"] }
```

## Example tool: feature flags

```
Flag { key: string, env: string, description: string, enabled: boolean,
       rollout_percent: integer 0..100, owner: string, updated_at: string, updated_by: string }
```

- `GET /api/flags?env=all|<env>&q=` returns `Flag[]`
- `GET /api/flags/{key}?env=<env>` returns `Flag` (404 when missing)
- `PUT /api/flags/{key}?env=<env>` body `{description?, enabled?, rollout_percent?, owner?}`
  - in a direct env: 200 `{"applied": true, "flag": Flag}`
  - elsewhere: 202 `{"applied": false, "approval": Approval}`
- `POST /api/flags?env=<env>` body `{key, description, enabled, rollout_percent, owner}`, same 200/202 shapes; 409 if the key exists
- `DELETE /api/flags/{key}?env=<env>`, same 200/202 shapes
- `GET /api/flags/{key}/evaluations?env=<env>&minutes=60` returns the per-minute series for the chart:
  ```
  { "key": string, "env": string, "points": [ { "t": string, "evaluations": integer, "enabled_share": number|null } ] }
  ```
  oldest first, one point per minute; `enabled_share` is null for a minute with no evaluations.

## Approvals (two-person rule)

```
Approval { id: string, env: string, tool: "flags", action: "create"|"update"|"delete",
           target: string, payload: object, before: object|null,
           status: "pending"|"approved"|"rejected"|"withdrawn"|"expired"|"failed",
           requested_by: string, requested_at: string,
           reviewed_by: string|null, reviewed_at: string|null, review_note: string|null,
           result: string|null }
```

- `GET /api/approvals?status=pending|all` returns `Approval[]`, newest first
- `GET /api/approvals/{id}` returns `Approval`
- `POST /api/approvals/{id}/approve` body `{note?}`: replays the stored change and returns
  the Approval with `status` `approved` (or `failed`, with `result` saying why). The reviewer
  must hold `approvals:review` and must not be the requester (403 otherwise).
- `POST /api/approvals/{id}/reject` body `{note}` (note required)
- `POST /api/approvals/{id}/withdraw` (requester only)
- A pending request older than `APPROVAL_TTL_HOURS` (default 72) reads as `expired`.

## Health

`GET /health` returns `{"status": "ok"}` (no auth).

## AI: the agent and MCP

Both act as the signed-in principal: the same token, the same scopes, the same approval rule.
Neither has rights of its own.

### Tool exposure

Each tool declares, in its registry entry, which of its actions are exposed to AI (the
`ai_actions` list): a name, a description written for a model, a Pydantic input model, and
whether it reads or writes. Nothing is exposed by default. For flags:
`list_flags`, `get_flag`, `get_flag_evaluations` (reads) and `update_flag`, `create_flag`,
`delete_flag` (writes). Approvals expose `list_approvals` and `get_approval` (reads) only;
approving or rejecting is never exposed to AI.

### MCP server

`/mcp` (streamable HTTP, MCP 2025-06+), served by FastMCP (current major) inside the API process.
Bearer auth as above. `tools/list` returns only the AI actions the caller's scopes allow
in at least one env. A write in a direct env applies; elsewhere it files an approval and
returns it. Every MCP call is logged with the principal, the tool and the outcome.

### Agent

`POST /api/agent` speaks the AG-UI protocol (1.0) over Server-Sent Events, served by a
Pydantic AI agent. Request: the AG-UI `RunAgentInput` (thread id, run id, messages, state).
The agent's tools are the same AI actions. A write is a human-in-the-loop step: the agent
emits an interrupt describing the change (tool, env, target, before, after); the run
resumes only when the client answers `confirm` or `cancel`. On confirm the change goes
through the normal path (applied in a direct env, an approval request elsewhere).

Configuration: `AGENT_MODEL` (a Pydantic AI model string, e.g. `anthropic:claude-...` or
`bedrock:...`); unset means the agent route answers 503 "Assistant is not configured" and
the UI hides the assistant. Tests use Pydantic AI's `TestModel`/`FunctionModel`, never a
real model.

`GET /api/agent/status` returns `{"enabled": boolean, "model": string|null}`.
