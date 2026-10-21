"""Write backend/openapi.json from the app.

The frontend generates its API types from this file. Run it after changing a
route or a model; `tests/test_contracts.py` fails while it is stale.

Usage:
    uv run python scripts/dump_openapi.py
"""

import logging

from platform_api.artifacts import OPENAPI_PATH, openapi_document

logging.disable(logging.CRITICAL)
OPENAPI_PATH.write_text(openapi_document())
print(f"wrote {OPENAPI_PATH}")
