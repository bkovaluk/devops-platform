"""Every tool this deployment serves.

A tool is a package with an ``install(app, platform)`` that builds its store,
registers its approval actions and includes its router. Listing it here is
what turns it on; its scopes live in
:data:`platform_api.auth.scopes.TOOL_ACTIONS`.
"""

from collections.abc import Callable
from typing import Final

from fastapi import FastAPI

from platform_api.context import Platform
from platform_api.tools import flags

type Installer = Callable[[FastAPI, Platform], None]

INSTALLERS: Final[tuple[Installer, ...]] = (flags.install,)
