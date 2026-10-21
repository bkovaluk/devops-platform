"""The actions tools expose to AI, and the one path both AI surfaces call them through.

A tool lists what a model may do with it as :class:`AiAction` entries; nothing
is exposed unless a tool declares it. An action's ``run`` calls the same
service functions as the tool's HTTP routes, as the signed-in principal, so
scopes, the direct-environment rule and the approval engine apply unchanged.

:class:`AiRegistry` is what the MCP server and the agent share: which actions
a principal is offered, argument validation, the read-only rule for view-as,
and one structured log line per call.
"""

import logging
from collections.abc import Callable, Iterator, Mapping, Sequence
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Any, Literal

from pydantic import BaseModel, ValidationError
from pydantic_core import to_jsonable_python

from platform_api.auth.principal import Principal
from platform_api.auth.scopes import Scope
from platform_api.auth.view_as import read_only
from platform_api.errors import ApiError, Forbidden, NotFound

logger = logging.getLogger(__name__)

type Kind = Literal["read", "write"]
type Surface = Literal["mcp", "agent"]


@dataclass(frozen=True, slots=True)
class ChangePreview:
    """What a write would do, shown to the person asked to confirm it."""

    tool: str
    env: str
    target: str
    before: dict[str, Any] | None
    after: dict[str, Any] | None

    def as_dict(self) -> dict[str, Any]:
        return {
            "tool": self.tool,
            "env": self.env,
            "target": self.target,
            "before": self.before,
            "after": self.after,
        }


@dataclass(frozen=True, slots=True)
class AiAction[P: BaseModel]:
    name: str
    #: Written for a model: what the action does and when to use it.
    description: str
    params: type[P]
    kind: Kind
    #: Unqualified requirements, any one of which opens the action. It is offered
    #: when the principal holds one in at least one environment; ``run`` checks
    #: the requirement qualified with the environment it acts in.
    requires: tuple[Scope, ...]
    run: Callable[[Principal, P], object]
    #: Writes only: the change ``run`` would make, authorized as ``run`` is.
    preview: Callable[[Principal, P], ChangePreview] | None = None

    def __post_init__(self) -> None:
        if not self.requires:
            raise ValueError(f"AI action '{self.name}' must require at least one scope")
        if (self.kind == "write") != (self.preview is not None):
            raise ValueError(f"AI action '{self.name}': writes, and only writes, need a preview")


@contextmanager
def _logged(
    surface: Surface, principal: Principal, name: str, arguments: Mapping[str, Any], success: str
) -> Iterator[None]:
    """One log line per AI call: who, which action, which env, and how it ended.

    Arguments other than the environment stay out of the log: they are free
    text the caller chose.
    """
    env = arguments.get("env")
    fields: dict[str, object] = {
        "surface": surface,
        "principal": principal.email,
        "view_as": principal.view_as,
        "tool": name,
        "env": env if isinstance(env, str) else None,
    }
    outcome, status = success, None
    try:
        yield
    except ApiError as exc:
        outcome, status = "refused", exc.status_code
        raise
    except ValidationError:
        outcome, status = "invalid", 422
        raise
    except Exception:
        outcome, status = "error", 500
        raise
    finally:
        logger.log(
            logging.ERROR if outcome == "error" else logging.INFO,
            "ai.call",
            extra={"fields": {**fields, "outcome": outcome, "status": status}},
        )


class AiRegistry:
    def __init__(self, environments: Sequence[str]) -> None:
        self._environments = tuple(environments)
        self._actions: dict[str, AiAction[Any]] = {}

    def register(self, *actions: AiAction[Any]) -> None:
        for action in actions:
            if action.name in self._actions:
                raise ValueError(f"AI action '{action.name}' is already registered")
            self._actions[action.name] = action

    @property
    def actions(self) -> list[AiAction[Any]]:
        return list(self._actions.values())

    def _held(self, principal: Principal, action: AiAction[Any]) -> bool:
        return any(
            principal.holds(Scope(required.tool, required.action, env))
            for required in action.requires
            for env in self._environments
        )

    def offered(self, principal: Principal) -> list[AiAction[Any]]:
        """The actions *principal* may use somewhere; reads only while viewing as someone."""
        return [
            action
            for action in self._actions.values()
            if self._held(principal, action) and not (principal.view_as and action.kind == "write")
        ]

    def _admit(
        self, principal: Principal, name: str, arguments: Mapping[str, Any]
    ) -> tuple[AiAction[Any], BaseModel]:
        action = self._actions.get(name)
        if action is None:
            raise NotFound(f"There is no AI action '{name}'.")
        if principal.view_as and action.kind == "write":
            raise read_only(principal)
        if not self._held(principal, action):
            needed = " or ".join(str(required) for required in action.requires)
            raise Forbidden(f"You need {needed} in at least one environment to use {name}.")
        return action, action.params.model_validate(dict(arguments))

    def call(
        self, principal: Principal, name: str, arguments: Mapping[str, Any], *, surface: Surface
    ) -> Any:
        """Run an action as *principal* and return its result as JSON-ready data."""
        with _logged(surface, principal, name, arguments, "ok"):
            action, params = self._admit(principal, name, arguments)
            return to_jsonable_python(action.run(principal, params))

    def propose(
        self, principal: Principal, name: str, arguments: Mapping[str, Any], *, surface: Surface
    ) -> ChangePreview:
        """What a write would change, authorized as the write itself is, changing nothing."""
        with _logged(surface, principal, name, arguments, "proposed"):
            action, params = self._admit(principal, name, arguments)
            if action.preview is None:
                raise ValueError(f"AI action '{name}' is a read; call it instead")
            return action.preview(principal, params)
