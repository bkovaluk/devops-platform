"""Optional: boto3 clients that act inside each environment's AWS account.

For tools whose environments live in separate AWS accounts. ``AWS_ROLE_ARNS``
maps an environment to the role this service assumes there; an environment
left out of the map uses the process's own credentials. Assumed credentials
are cached per environment and refreshed shortly before they expire, and
clients are cached per (service, environment) against the credentials they
were built with.

    from platform_api.aws import get_boto3_client
    ssm = get_boto3_client("ssm", env)
"""

import threading
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime, timedelta
from functools import lru_cache
from typing import Any, Final

import boto3
from botocore.config import Config

from platform_api.clock import Clock, utc_now
from platform_api.config import get_settings

REFRESH_BEFORE: Final = timedelta(minutes=5)
SESSION_SECONDS: Final = 3600

BOTO_CONFIG: Final = Config(
    connect_timeout=5,
    read_timeout=10,
    retries={"mode": "standard", "max_attempts": 3},
)


@dataclass(frozen=True, slots=True)
class _Credentials:
    access_key_id: str
    secret_access_key: str
    session_token: str
    expires_at: datetime


class CrossAccountClients:
    def __init__(
        self,
        role_arns: Mapping[str, str],
        region: str,
        *,
        session_name: str = "platform-api",
        sts_client: Any | None = None,
        clock: Clock = utc_now,
    ) -> None:
        self._role_arns = dict(role_arns)
        self._region = region
        self._session_name = session_name
        self._sts = sts_client
        self._clock = clock
        self._lock = threading.Lock()
        self._credentials: dict[str, _Credentials] = {}
        self._clients: dict[tuple[str, str], tuple[Any, datetime | None]] = {}

    def _sts_client(self) -> Any:
        if self._sts is None:
            self._sts = boto3.client("sts", region_name=self._region, config=BOTO_CONFIG)
        return self._sts

    def _fresh(self, env: str) -> _Credentials:
        cached = self._credentials.get(env)
        if cached and cached.expires_at - self._clock() > REFRESH_BEFORE:
            return cached
        response = self._sts_client().assume_role(
            RoleArn=self._role_arns[env],
            RoleSessionName=f"{self._session_name}-{env}",
            DurationSeconds=SESSION_SECONDS,
        )
        raw = response["Credentials"]
        credentials = _Credentials(
            access_key_id=raw["AccessKeyId"],
            secret_access_key=raw["SecretAccessKey"],
            session_token=raw["SessionToken"],
            expires_at=raw["Expiration"],
        )
        self._credentials[env] = credentials
        return credentials

    def client(self, service: str, env: str) -> Any:
        """A boto3 client for *service* acting in *env*'s account."""
        with self._lock:
            cached = self._clients.get((service, env))
            if env not in self._role_arns:
                if cached is not None:
                    return cached[0]
                built = boto3.client(service, region_name=self._region, config=BOTO_CONFIG)
                self._clients[(service, env)] = (built, None)
                return built
            credentials = self._fresh(env)
            if cached is not None and cached[1] == credentials.expires_at:
                return cached[0]
            built = boto3.client(
                service,
                region_name=self._region,
                config=BOTO_CONFIG,
                aws_access_key_id=credentials.access_key_id,
                aws_secret_access_key=credentials.secret_access_key,
                aws_session_token=credentials.session_token,
            )
            self._clients[(service, env)] = (built, credentials.expires_at)
            return built


@lru_cache(maxsize=1)
def _clients() -> CrossAccountClients:
    settings = get_settings()
    return CrossAccountClients(settings.aws_role_arn_map, settings.aws_region)


def get_boto3_client(service: str, env: str) -> Any:
    return _clients().client(service, env)
