---
name: add-approval-action
description: Make a tool action approval-gated on both halves (the two-person rule). Use when asked to "require approval for", "gate this behind approvals", "add a new approvable action", "make delete go through review", or when a new write must file an approval request outside the direct environments.
---

# Add an approval-gated action

Outside `DIRECT_ENVS` a write is never applied by the route: it is filed with
the approval engine, and the tool's `replay` applies it when someone else
approves. The engine owns the two-person rules (no self-review, a note to
reject, one pending request per target, expiry after `APPROVAL_TTL_HOURS`);
tools never re-implement them. The steps use a `restart` action on `widgets`.

## Backend (`backend/`)

1. **Scope.** The action's scope exists in `TOOL_ACTIONS`
   (`platform_api/auth/scopes.py`); the route depends on
   `require_scope(TOOL, "write")` (or the action's own scope).
2. **Register the verb.** Add it to the tool's `ACTIONS` frozenset in
   `tools/<tool>/service.py`; `install` registers
   `ApprovalHandler(TOOL, ACTIONS, service.replay)` with
   `platform.approval_registry`. `ApprovalEngine.file` refuses a verb no
   handler registered.
3. **File it.** In the service method, apply at once when
   `env in self._direct_envs`, otherwise:
   ```python
   approval = self._approvals.file(
       env=env, tool=TOOL, action="restart", target=key,
       payload=payload, before=current.model_dump(mode="json"), requested_by=actor,
   )
   return ApprovalQueued(approval=approval)
   ```
   `payload` is exactly what replay needs; `before` is the resource as the
   requester saw it (None for a create).
4. **Replay.** Add a `case "restart":` to `replay(approval) -> str`. Re-read the
   resource and refuse with `Conflict` when it no longer equals
   `approval.before` (see `FlagService._unchanged_since_filed`), or `NotFound`
   when it is gone. Apply as `approval.requested_by`, with time from the
   injected clock. Return one sentence saying what was done: it becomes the
   request's `result`. Raising marks the request `failed` with the message.
5. **Route.** 200 `{applied: true, ...}` in a direct env, 202
   `{applied: false, approval}` elsewhere; declare the 202 in the route's
   `responses`.
6. **Tests** (patterns in `tests/test_flags.py` and `tests/test_approvals.py`):
   a direct env applies; another env answers 202 and changes nothing; a
   reviewer's approve replays and the result sentence reads right; replay fails
   when the target moved on or is gone; the requester cannot approve;
   `approvals:review` is checked per env.
7. **Contract.** Regenerate `openapi.json` and `scope-contract.json` and list
   the verb under `Approval.action` in `../CONTRACT.md` (skill `api-contract`).

## Frontend (`frontend/`)

1. **Approval-aware hook.** In `src/features/<tool>/use-<tool>-actions.ts`
   (copy `features/flags/use-flag-actions.ts`) add one
   `useIdentityBoundMutation` per verb. `onSuccess` reads `result.applied`:
   toast a link to the resource (applied) or to the request (filed) through
   `<tool>-toast.ts`, and invalidate the tool's keys or `approvalKeys.all`.
   `onError` is `notifyFailure`. The hook exposes `needsApproval(env)`; call
   sites never branch on the env themselves.
2. **Guard rails before submit.** The form or dialog captures the env when it
   opens and asks `needsApproval(env)`. Routed, the submit is
   `variant="glass-amber"` with `GitPullRequest`, reads
   "Request approval for {env}", and sits under an amber callout saying a
   teammate must approve it. Direct, it reads "Save to {env}" (destructive:
   `glass-rose`, "Delete from {env}"). See `src/app/flags/FlagSheet.tsx` and
   `src/app/flags/DeleteFlagDialog.tsx`. Never optimistic for a routed write.
3. **Preview and diff.** The tool's entry in `RESOURCE_REGISTRY`
   (`src/components/approvals/resource-registry.tsx`) covers the verb in
   `actionLabel` and `actionPhrase`, a `link` that is null when the subject does
   not exist (yet, or any more), and a `renderDiff` (usually `FieldDiff` over
   the tool's fields). The inbox, Home's feed, the toasts and the assistant's
   `ProposalCard` all draw from this entry; nothing else branches on
   `approval.tool`.
4. **MSW.** In `src/test/msw/handlers.ts` the route answers 202 with a pending
   approval outside `dev`, and the approve handler replays it (failing it when
   the fixture moved on), as the flags handlers do.
5. **Tests.** The sheet shows the amber submit and callout for `staging` and
   "Save to dev" for `dev`; the request reaches the inbox with its diff; it is
   approved as `reviewer`, never by its requester. Assert with
   `toBeActionable`, never `toBeEnabled`.

## Verify

```bash
cd backend && uv run pytest -q
cd frontend && bun run check-api-types && bun run typecheck && bun run lint && bun run test
```

Ratchets that guard this: `mutation-affordances` (the submit must be a
`Button` the view-as guard reaches: `mutates` or `type="submit"`),
`no-direct-use-mutation.test.ts`, and the backend's `tests/test_contracts.py`.
