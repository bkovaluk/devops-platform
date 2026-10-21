---
name: add-tool
description: Add a new tool to the console end to end, backend and frontend. Use when asked to "add a tool", "add a new resource type", "build a widgets tool", "scaffold a tool like flags", or to manage a new kind of per-environment resource with approvals.
---

# Add a tool

A tool is one backend package plus one frontend registry entry, its routes,
hooks and views. `flags` is the reference implementation on both halves: copy
its shape. The steps use a hypothetical `widgets` tool whose noun is `widget`.

## Backend (`backend/`)

1. **Scopes.** Add `"widgets": ("read", "write")` to `TOOL_ACTIONS` in
   `platform_api/auth/scopes.py`. Always include `read`: the approval queue
   shows a request to whoever can read its tool in its env. Grant the scopes
   in `SEEDED_ROLES` (`platform_api/auth/roles.py`).
2. **Models** in `platform_api/tools/widgets/models.py`: the resource (with
   `env`, `updated_at`, `updated_by`), a create body, a patch body whose
   `changes()` returns only the fields set, and the two change answers
   (`WidgetApplied`, `ApprovalQueued`), as in `tools/flags/models.py`.
3. **Store** in `store.py`: a `WidgetStore` protocol, `MemoryWidgetStore`,
   `DynamoWidgetStore` (`pk = WIDGET#<env>`, `sk = <key>`, errors through
   `platform_api/storage.py`) and `build_widget_store(settings)`.
4. **Service** in `service.py`: `TOOL: Final = "widgets"`, `ACTIONS` (the verbs
   it files), reads, and writes that apply in `direct_envs` and otherwise call
   `self._approvals.file(...)`. Time comes only from the injected clock. Add
   `replay(approval) -> str` (skill `add-approval-action`).
5. **Routes** in `routes.py`: `APIRouter(prefix="/api/widgets")`. Single-item
   routes depend on `require_scope(TOOL, "<action>")` and `SingleEnv`; the list
   route uses `selected_envs`, the service `fan_out`. A change answers 200
   `{applied: true, ...}` or 202 `{applied: false, approval}`. Raise the
   `ApiError` subclasses in `platform_api/errors.py` with one sentence a person
   can act on, and declare statuses with the maps at the bottom of `errors.py`.
6. **AI actions** in `ai.py` (skill `ai-actions`): reads, and writes with a
   `preview`, writes named `<verb>_<noun>` (`update_widget`).
7. **Install** in `tools/widgets/__init__.py`, then add `widgets.install` to
   `INSTALLERS` in `platform_api/tools/__init__.py`:
   ```python
   def install(app: FastAPI, platform: Platform) -> None:
       settings = platform.settings
       service = WidgetService(
           build_widget_store(settings), platform.approvals, settings.direct_env_list, platform.clock
       )
       platform.approval_registry.register(ApprovalHandler(TOOL, ACTIONS, service.replay))
       platform.ai.register(*ai_actions(platform, service))
       app.state.widgets = service
       app.include_router(router)
   ```
8. **Tests** in `tests/test_widgets.py`, through the `make_client` fixture
   (`create_app(settings_for(...), verifier=TokenIsEmail(), clock=...)`); the
   bearer token is the caller's email (`as_user`). Cover direct and approval
   envs, 403 per env, 404 and 409, replay, and replay refusing a resource that
   moved. DynamoDB through moto. Extend the expected paths in
   `tests/test_contracts.py::test_openapi_covers_the_contract`, the action set
   in `tests/test_ai_actions.py::test_exactly_the_contract_actions` and the
   per-role sets in `tests/test_mcp.py`.
9. **Contract.** Write the routes into `../CONTRACT.md`, then
   `uv run python scripts/dump_openapi.py` and
   `uv run python scripts/dump_scope_contract.py` (skill `api-contract`).

## Frontend (`frontend/`)

1. **Contract in.** `bun run generate-api-types` and
   `bun run generate-scope-contract`; re-export the new schemas from
   `src/types/api.ts`. Add `'widgets'` (and any new action) to `Tool` /
   `Action` in `src/features/auth/permissions.ts` (`permissions.test.ts` fails
   until you do), and its query roots to `TOOL_QUERY_PREFIXES` in
   `src/features/auth/identity-cache.ts`.
2. **Hooks** in `src/features/widgets/`: `widgets-api.ts` (fetchers over
   `lib/api-client`, a key factory rooted at `['widgets']`), `use-widgets.ts`
   (queries), `widget-search.ts` (a zod schema for every URL param),
   `widget-toast.ts` (`notifyWithLink`) and `use-widget-actions.ts`, the
   approval-aware hook (skill `add-approval-action`).
3. **Routes** in `src/router.tsx`: the tool's root route renders
   `<ToolBoundary tool={TOOL_REGISTRY.widgets} />`, children hang under it,
   every one with `validateSearch`. Views read params through
   `getRouteApi('<route id>').useSearch()`.
4. **Registry entry** in `src/features/tools/tool-registry.tsx`: id, label,
   icon, `accent: TOOL_ACCENTS.widgets.text` (add it to
   `src/lib/theme-constants.ts`), group, path (add it to `ToolPath`), a lazy
   view, `access: { kind: 'scoped', tool: 'widgets', entry: inAnyEnv('widgets', 'read') }`,
   title, `shortcutRank`, `homeTile`, `paletteCommands`, and contributions in
   `src/features/tools/contributions/widgets.tsx` (each reads its own tool only).
5. **Links.** Add `{ kind: 'widget', ... }` to `ResourceLink` in
   `src/lib/resource-links.ts`.
6. **Approvals.** One `RESOURCE_REGISTRY` entry in
   `src/components/approvals/resource-registry.tsx` with `noun: 'widget'`; the
   assistant's proposal card finds it by that noun.
7. **Views** in `src/app/widgets/`, built from the design system only (skill
   `design-standards`).
8. **MSW.** Routes in `src/test/msw/handlers.ts`, fixtures in
   `src/test/msw/db.ts`, on the API's terms: 200 in `dev`, 202 elsewhere,
   scopes per env, view-as read-only. Document them in `src/test/msw/README.md`.
9. **Tests.** Views through `renderApp('/widgets?env=all', { as: 'editor' })`
   from `src/test/render.tsx`, against the MSW node server.
10. **Registry and screens.** Claim every new file in an item in
    `scripts/registry/items.ts`, run `bun run registry:build`, then the
    `screenshot-sweep` skill.

## Verify

```bash
cd backend && uv run ruff check . && uv run ruff format --check . \
  && uv run mypy platform_api && uv run pytest -q
cd frontend && bun run registry:build && bun run check-api-types \
  && bun run typecheck && bun run lint && bun run format:check && bun run test && bun run build
```

What fails on a half-built tool: `tool-registry.test.tsx` (a path that is no
route), `resource-links.test.ts` (a link that opens nothing),
`permissions.test.ts` (vocabulary drift), `no-direct-use-mutation.test.ts`, the
six `src/app/*-affordances.test.ts` standards, `scripts/registry/registry.test.ts`
(a file no item claims, a stale `registry.json`), and the backend's
`tests/test_contracts.py` (stale `openapi.json` or `scope-contract.json`).
