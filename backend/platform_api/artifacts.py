"""The two generated files the frontend reads, rendered deterministically.

``backend/openapi.json`` is the machine contract for every route;
``scope-contract.json`` at the repository root is the permission grammar.
Both are built from :func:`~platform_api.config.default_settings`, so they do
not depend on who generates them, and a test fails when either is stale.
"""

import json
from pathlib import Path
from typing import Final

from platform_api.app import create_app
from platform_api.auth.contract import build_scope_contract
from platform_api.auth.scopes import vocabulary_for
from platform_api.config import default_settings

BACKEND_DIR: Final = Path(__file__).resolve().parents[1]
OPENAPI_PATH: Final = BACKEND_DIR / "openapi.json"
SCOPE_CONTRACT_PATH: Final = BACKEND_DIR.parent / "scope-contract.json"


def _render(document: object) -> str:
    return json.dumps(document, indent=2, sort_keys=True) + "\n"


def openapi_document() -> str:
    return _render(create_app(default_settings()).openapi())


def scope_contract_document() -> str:
    vocabulary = vocabulary_for(default_settings().environment_list)
    return _render(build_scope_contract(vocabulary))
