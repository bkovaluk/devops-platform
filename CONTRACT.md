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

## Investigations: the DevOps agent's findings

An alarm-investigating DevOps agent writes one finding per investigation to a DynamoDB
table in each environment (`FINDINGS_TABLES`, read through that env's `AWS_ROLE_ARNS`
role). The API reads them and writes only their review fields. Every field the agent may
not have written is optional, so an older item reads with the contract's defaults.

```
FindingRow { finding_id: string, env: string, created_at: string,
             status: "open"|"acknowledged"|"closed", source: string|null,
             severity: string|null, title: string|null, alarm_name: string|null,
             resource_key: string|null, resource_type: string|null, resource_name: string|null,
             kind: string, outcome: "reported"|"incomplete"|"triaged"|null,
             fix_effort: string|null, confidence: "high"|"medium"|"low"|null,
             recurrence_count: integer, linked_count: integer, alarm_count: integer|null,
             tool_call_count: integer|null, tools_used: string[]|null, model: string|null,
             steps: integer|null, error_signature: string|null,
             resolution: "confirmed"|"false_positive"|"wrong"|"dismissed"|null,
             resolved_by: string|null, resolved_at: string|null, acknowledged_by: string|null }

FindingDetail = FindingRow & {
  summary, likely_cause, confidence_reason, fix_effort_reason, severity_floor,
  proposed_severity, alarm_arn, alarm_reason, alarm_time, account_id, region,
  resolution_note, acknowledged_at, last_seen_at, incident_id, linked_to,
  previous_finding_id: string|null,
  hypotheses: { text, state: "likely"|"ruled_out"|"unverified", steps: integer[] }[],
  evidence: { kind, detail, steps: integer[] }[],
  checked: { text, steps: integer[] }[],
  actions: { kind: "change"|"code"|"read"|"approval", text, detail, command }[],
  suggested_actions: string[],
  tool_trail: { step, tool, status: "data"|"empty"|"error", input, args,
                call: { provider, service, action, label, subject,
                        kind: "evidence"|"lookup", refused }|null }[],
  run: { stop_reason, turns, max_turns, duration_seconds, weighted_tokens, token_budget }|null,
  tokens_used: integer|null, context_summary: { sections, counts, chars, truncated }|null,
  sources_with_data, prior_finding_ids, linked_alarms, member_alarms: string[],
  history: { finding_id, created_at, title, status, resolution, outcome }[] }
```

`resource_type` and `resource_name` are read off the resource key (its CloudWatch namespace
without `AWS/`, and the dimension value); `model` is the model id shortened (`opus-5.5`);
`history` is up to five earlier findings on the same resource, newest first. What a call
returned is never stored, so a trail step carries its input only.

- `GET /api/findings?env=all|<env>&status=open|acknowledged|closed&window=24h|7d|30d|90d|365d`
  returns `FindingList { env, status, window, items: FindingRow[], total, facets, truncated }`
  - more keys narrow it, any value of a key matching: `severity`, `outcome`, `effort`,
    `confidence`, `type`, `kind` (also `has_linked`, `repeating`), `tool`, `model`,
    `resolution`, `resolved_by`, each repeatable, and `q` (title, alarm, resource or error
    signature, at most 200 characters)
  - `triage=true` includes the findings the agent's triage wrote without investigating
    (`skipped`, `deferred`, `linked`, `grouped`, `storm`); without it a kind filter for one
    of them admits that kind alone
  - `items` is newest first, one page of `limit` (default 100, at most 200) from `offset`;
    `total` counts every match; `facets` counts the window, status and triage rule before
    any other narrowing (`{facet: {value: count}}`); `truncated` says an environment held
    more than one read takes (5,000)
  - `window=365d` is for `status=closed`; any other status is a 400
- `GET /api/findings/{finding_id}?env=<env>` returns `FindingDetail` (404 when missing)
- `POST /api/findings/{finding_id}/acknowledge?env=<env>` marks an open finding
  `acknowledged` with `acknowledged_at` and `acknowledged_by`, keeps it 90 days, and returns
  `FindingDetail`; 409 when it is not open
- `POST /api/findings/{finding_id}/close?env=<env>` body `{resolution, note?}` closes it with
  `resolution`, `resolution_note`, `resolved_at` and `resolved_by`, keeps it and its eval
  snapshot 365 days, and returns `FindingDetail`
  - `confirmed`, `false_positive` and `wrong` grade a reported cause (a finding without an
    `outcome` counts as reported); `dismissed` is for one that reported none; anything else
    is a 409
  - `wrong` needs a note (422); a note is at most 500 characters after trimming
  - 409 when it is already closed, naming who closed it
- Reads take `findings:read` in the env; reviews take `findings:review`. A review is a
  verdict on the agent's record and changes nothing the finding is about, so it applies at
  once in every environment and is never filed as an approval request.

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
