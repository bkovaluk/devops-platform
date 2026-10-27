"""Settings, read once from the environment (and `.env` when present).

List-valued settings are comma-separated strings and map-valued ones are JSON
objects, so every value can be set as a plain environment variable.
"""

import json
from functools import lru_cache
from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _split(raw: str) -> list[str]:
    return [part.strip() for part in raw.split(",") if part.strip()]


def _json_object(name: str, raw: str) -> dict[str, object]:
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"{name} is not valid JSON: {exc}") from exc
    if not isinstance(parsed, dict):
        raise ValueError(f"{name} must be a JSON object")
    return parsed


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "DevOps Platform"
    log_level: str = "INFO"
    cors_origins: str = ""

    # Ordered lowest to highest. A change in a direct environment applies at
    # once; anywhere else it becomes an approval request.
    environments: str = "dev,staging,prod"
    direct_envs: str = "dev"

    auth_mode: Literal["dev", "oidc"] = "dev"
    # `dev` answers every request as this user, holding these roles.
    dev_user_email: str = "ada@example.com"
    dev_user_name: str = "Ada"
    dev_user_roles: str = "admin"
    # `oidc` verifies the bearer token as an ID token signed by the issuer.
    oidc_issuer: str | None = None
    oidc_audience: str | None = None
    oidc_jwks_url: str | None = None
    # When set, the token's `hd` claim (Google Workspace) must equal it.
    oidc_hosted_domain: str | None = None

    # JSON {"<email>": ["<role>", ...]}; anyone unlisted holds DEFAULT_ROLES.
    role_bindings: str = "{}"
    default_roles: str = "viewer"
    # JSON {"<role>": ["<scope>", ...]}, added to the seeded roles.
    custom_roles: str = "{}"

    approval_ttl_hours: int = 72

    store: Literal["memory", "dynamodb"] = "memory"
    dynamodb_table: str = "devops-platform"
    seed_example_data: bool = True

    aws_region: str = "us-east-1"
    # JSON {"<env>": "<role arn>"}; an env left out uses ambient credentials.
    aws_role_arns: str = "{}"

    # JSON {"<env>": "<table name>"}: the DevOps agent's findings table in each
    # env, read through that env's AWS role. An env left out reads
    # `devops-agent-findings-<env>`, the agent's default name.
    findings_tables: str = "{}"

    # A Pydantic AI model string, e.g. "anthropic:<model>"; unset turns the assistant off.
    agent_model: str | None = None

    @model_validator(mode="after")
    def _check(self) -> Settings:
        envs = self.environment_list
        if not envs:
            raise ValueError("ENVIRONMENTS must name at least one environment")
        if len(set(envs)) != len(envs):
            raise ValueError("ENVIRONMENTS must not repeat an environment")
        if "all" in envs:
            raise ValueError("'all' is reserved and cannot be an environment name")
        unknown = sorted(set(self.direct_env_list) - set(envs))
        if unknown:
            raise ValueError(f"DIRECT_ENVS names environments not in ENVIRONMENTS: {unknown}")
        if self.approval_ttl_hours < 1:
            raise ValueError("APPROVAL_TTL_HOURS must be at least 1")
        if self.auth_mode == "oidc":
            missing = [
                name
                for name, value in (
                    ("OIDC_ISSUER", self.oidc_issuer),
                    ("OIDC_AUDIENCE", self.oidc_audience),
                    ("OIDC_JWKS_URL", self.oidc_jwks_url),
                )
                if not value
            ]
            if missing:
                raise ValueError(f"AUTH_MODE=oidc requires {', '.join(missing)}")
        # Parsed eagerly so malformed JSON fails at startup, not on first use.
        _ = self.role_binding_map, self.custom_role_map, self.aws_role_arn_map
        stray = sorted(set(self.findings_table_map) - set(envs))
        if stray:
            raise ValueError(f"FINDINGS_TABLES names environments not in ENVIRONMENTS: {stray}")
        return self

    @property
    def environment_list(self) -> list[str]:
        return _split(self.environments)

    @property
    def direct_env_list(self) -> list[str]:
        return _split(self.direct_envs)

    @property
    def cors_origin_list(self) -> list[str]:
        return _split(self.cors_origins)

    @property
    def dev_user_role_list(self) -> list[str]:
        return _split(self.dev_user_roles)

    @property
    def default_role_list(self) -> list[str]:
        return _split(self.default_roles)

    @property
    def role_binding_map(self) -> dict[str, list[str]]:
        parsed = _json_object("ROLE_BINDINGS", self.role_bindings)
        bindings: dict[str, list[str]] = {}
        for email, roles in parsed.items():
            if not isinstance(roles, list) or not all(isinstance(r, str) for r in roles):
                raise ValueError(f"ROLE_BINDINGS['{email}'] must be a list of role names")
            bindings[email.lower()] = [str(r) for r in roles]
        return bindings

    @property
    def custom_role_map(self) -> dict[str, list[str]]:
        parsed = _json_object("CUSTOM_ROLES", self.custom_roles)
        roles: dict[str, list[str]] = {}
        for name, scopes in parsed.items():
            if not isinstance(scopes, list) or not all(isinstance(s, str) for s in scopes):
                raise ValueError(f"CUSTOM_ROLES['{name}'] must be a list of scopes")
            roles[name] = [str(s) for s in scopes]
        return roles

    @property
    def aws_role_arn_map(self) -> dict[str, str]:
        parsed = _json_object("AWS_ROLE_ARNS", self.aws_role_arns)
        if not all(isinstance(v, str) for v in parsed.values()):
            raise ValueError("AWS_ROLE_ARNS must map environment names to role ARN strings")
        return {env: str(arn) for env, arn in parsed.items()}

    @property
    def findings_table_map(self) -> dict[str, str]:
        parsed = _json_object("FINDINGS_TABLES", self.findings_tables)
        if not all(isinstance(v, str) and v for v in parsed.values()):
            raise ValueError("FINDINGS_TABLES must map environment names to table names")
        return {env: str(table) for env, table in parsed.items()}

    def findings_table(self, env: str) -> str:
        """The findings table the DevOps agent writes in *env*."""
        return self.findings_table_map.get(env, f"devops-agent-findings-{env}")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


def default_settings() -> Settings:
    """The settings a fresh checkout runs with, ignoring the environment.

    Generated artifacts (OpenAPI, the scope contract) are built from these so
    they do not change with whoever runs the script.
    """
    return Settings.model_construct()
