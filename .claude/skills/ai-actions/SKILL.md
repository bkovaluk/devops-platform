---
name: ai-actions
description: Expose a tool action to MCP and the in-app assistant safely. Use when asked to "let the assistant do X", "add an MCP tool", "expose this to the agent", "make the AI able to read or change widgets", or when changing what `/mcp` or `POST /api/agent` can do.
---

# Expose an action to AI

MCP (`/mcp`) and the assistant (`POST /api/agent`) act as the signed-in
principal, with the same token, scopes, view-as and approval rule as the API.
Neither has rights of its own, and nothing is exposed unless a tool declares
it as an `AiAction` (`backend/platform_api/ai/actions.py`). Both surfaces call
actions through one `AiRegistry`, which offers, validates, holds view-as to
reads, and logs.

## Rules

- An action's `run` calls the same service functions as the routes, as the
  caller. No private path around the service.
- `requires` lists unqualified scopes (`Scope(TOOL, "read")`): the action is
  offered when the caller holds one in any env. `run` checks the scope
  qualified with the env it acts in (`check_env_access`); list reads use
  `selected_envs`.
- A write has `kind="write"` and a `preview` returning
  `ChangePreview(<action name>, env, target, before, after)`, authorized
  exactly as `run` is and changing nothing. `AiAction` refuses a write
  without a preview and a read with one.
- In the assistant a write never runs in the run that proposes it: the run
  ends with an interrupt carrying the preview, and the change applies only
  after the person confirms, through the normal path (applied in a direct env,
  an approval request elsewhere). Over MCP a write applies or files an
  approval request at once.
- Deciding an approval (approve, reject, withdraw) is never an AI action;
  `tests/test_ai_actions.py::test_deciding_approvals_is_never_exposed` holds
  the line.
- Name writes `<verb>_<noun>`, verb `create`, `update` or `delete` and the noun
  of the tool's `RESOURCE_REGISTRY` entry (`update_widget`): the frontend's
  proposal card finds the tool by that noun.
- Write descriptions for a model: what it does, when to use it, and for a
  write, that outside a direct env it files an approval request.
- Logging is the registry's: one `ai.call` line per call with surface,
  principal, view-as, action, env, outcome and status. Never log other
  arguments; they are free text the caller chose.

## Steps

1. In `backend/platform_api/tools/<tool>/ai.py` add a Pydantic input model per
   action (every field with a `description`: the MCP schema comes from it),
   the `run`, and for a write the `preview`. Copy `tools/flags/ai.py`.
2. Return them from `ai_actions(platform, service)` and register them in the
   tool's `install`: `platform.ai.register(*ai_actions(platform, service))`.
3. List the action names under "Tool exposure" in `CONTRACT.md`.
4. Tests:
   - `tests/test_ai_actions.py`: add the names to
     `test_exactly_the_contract_actions`; cover the offer per role, refusal per
     env, view-as reads only, argument validation, the preview's before and
     after, that previewing changes nothing, and the log line.
   - `tests/test_mcp.py`: through the in-process FastMCP `Client` (the
     `tool_names` and `call` helpers): listed per role, a write applies in
     `dev` and files an approval in `staging`, a write beyond scope is a tool
     error.
   - `tests/test_agent.py`: drive the agent with a `Script` (Pydantic AI
     `FunctionModel`), never a real model: a read runs at once, a write ends
     the run with an interrupt whose metadata is the change, confirm applies or
     files, cancel does nothing, view-as is offered reads only.
5. Frontend: nothing per action once the tool has a `RESOURCE_REGISTRY`
   entry; the dock's `ProposalCard` draws the diff from it. To show the action
   in MSW mode, script it in `frontend/src/test/msw/agent.ts`.

## Verify

```bash
cd backend && uv run pytest -q tests/test_ai_actions.py tests/test_mcp.py tests/test_agent.py \
  && uv run mypy platform_api && uv run pytest -q
cd frontend && bun run test
```

Over MCP against the dev-mode backend:

```bash
curl -s localhost:8000/mcp -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' -H 'Authorization: Bearer dev' \
  -d '{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}'
```
