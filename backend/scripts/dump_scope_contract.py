"""Write scope-contract.json at the repository root.

The frontend reads the scope vocabulary and the seeded roles from this file and
runs its `cases` against its own matcher. Run it after changing a tool's
actions or a seeded role; `tests/test_contracts.py` fails while it is stale.

Usage:
    uv run python scripts/dump_scope_contract.py
"""

from platform_api.artifacts import SCOPE_CONTRACT_PATH, scope_contract_document

SCOPE_CONTRACT_PATH.write_text(scope_contract_document())
print(f"wrote {SCOPE_CONTRACT_PATH}")
