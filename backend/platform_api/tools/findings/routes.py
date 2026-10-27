"""The DevOps agent's findings: the list, one finding, and its review.

Reads take ``findings:read`` and each review takes ``findings:review`` in the
finding's environment. A review lands at once in every environment: it records
a person's verdict on the agent's output and changes nothing the finding is
about.
"""

from typing import Annotated, cast

from fastapi import APIRouter, Depends, Path, Query, Request

from platform_api.auth.dependencies import CurrentPrincipal, require_scope
from platform_api.auth.principal import Principal
from platform_api.context import Platform, get_platform
from platform_api.envs import SingleEnv, selected_envs
from platform_api.errors import AUTHENTICATED, ENV_ITEM, ENV_LIST, ENV_MUTATION
from platform_api.tools.findings.models import (
    FindingDetail,
    FindingList,
    FindingQuery,
    ResolveFindingBody,
)
from platform_api.tools.findings.service import TOOL, FindingService

router = APIRouter(prefix="/api/findings", tags=["findings"], responses=AUTHENTICATED)


def get_findings(request: Request) -> FindingService:
    return cast(FindingService, request.app.state.findings)


Findings = Annotated[FindingService, Depends(get_findings)]
Reader = Annotated[Principal, Depends(require_scope(TOOL, "read"))]
Reviewer = Annotated[Principal, Depends(require_scope(TOOL, "review"))]
FindingId = Annotated[str, Path(pattern=r"^[A-Za-z0-9._:-]+$", max_length=128)]


@router.get("", responses=ENV_LIST)
def list_findings(
    platform: Annotated[Platform, Depends(get_platform)],
    principal: CurrentPrincipal,
    findings: Findings,
    ask: Annotated[FindingQuery, Query()],
) -> FindingList:
    """One status's findings over a window, faceted and filtered, newest first."""
    return findings.list(selected_envs(platform, principal, ask.env, TOOL, "read"), ask)


@router.get("/{finding_id}", responses=ENV_ITEM)
def get_finding(
    finding_id: FindingId, env: SingleEnv, _: Reader, findings: Findings
) -> FindingDetail:
    """One finding, with the earlier findings on the same resource."""
    return findings.get(env, finding_id)


@router.post("/{finding_id}/acknowledge", responses=ENV_MUTATION)
def acknowledge_finding(
    finding_id: FindingId, env: SingleEnv, principal: Reviewer, findings: Findings
) -> FindingDetail:
    """Take an open finding: somebody is looking at it."""
    return findings.acknowledge(env, finding_id, principal.email)


@router.post("/{finding_id}/close", responses=ENV_MUTATION)
def close_finding(
    finding_id: FindingId,
    body: ResolveFindingBody,
    env: SingleEnv,
    principal: Reviewer,
    findings: Findings,
) -> FindingDetail:
    """Close a finding with a verdict on what the agent reported."""
    return findings.close(env, finding_id, body, principal.email)
