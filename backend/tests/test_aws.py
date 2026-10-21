from datetime import timedelta
from typing import Any

import boto3
import pytest
from botocore.stub import Stubber

from platform_api import aws
from platform_api.aws import CrossAccountClients
from tests.conftest import START, FakeClock

ROLE = "arn:aws:iam::123456789012:role/platform-api"
EXPECTED = {"RoleArn": ROLE, "RoleSessionName": "platform-api-prod", "DurationSeconds": 3600}


def assume_role_response(expires_in: timedelta, key: str) -> dict[str, Any]:
    return {
        "Credentials": {
            "AccessKeyId": f"AKIA{key:X<12}",
            "SecretAccessKey": "secret-key-for-tests",
            "SessionToken": "session-token-for-tests",
            "Expiration": START + expires_in,
        }
    }


def access_key(client: Any) -> str:
    return str(client._request_signer._credentials.access_key)


@pytest.fixture
def sts() -> Any:
    return boto3.client(
        "sts",
        region_name="us-east-1",
        aws_access_key_id="testing",
        aws_secret_access_key="testing",
    )


def test_assumes_the_env_role_once_and_reuses_the_client(sts: Any) -> None:
    clients = CrossAccountClients(
        {"prod": ROLE}, "us-east-1", sts_client=sts, clock=FakeClock(START)
    )
    with Stubber(sts) as stubber:
        stubber.add_response(
            "assume_role", assume_role_response(timedelta(hours=1), "ONE"), EXPECTED
        )
        first = clients.client("s3", "prod")
        assert clients.client("s3", "prod") is first
        stubber.assert_no_pending_responses()
    assert access_key(first) == "AKIAONEXXXXXXXXX"


def test_refreshes_credentials_before_they_expire(sts: Any) -> None:
    clock = FakeClock(START)
    clients = CrossAccountClients({"prod": ROLE}, "us-east-1", sts_client=sts, clock=clock)
    with Stubber(sts) as stubber:
        stubber.add_response(
            "assume_role", assume_role_response(timedelta(hours=1), "ONE"), EXPECTED
        )
        stubber.add_response(
            "assume_role", assume_role_response(timedelta(hours=2), "TWO"), EXPECTED
        )
        first = clients.client("ssm", "prod")
        clock.advance(minutes=56)
        second = clients.client("ssm", "prod")
        stubber.assert_no_pending_responses()
    assert second is not first
    assert access_key(second) == "AKIATWOXXXXXXXXX"


def test_unmapped_env_uses_ambient_credentials(sts: Any) -> None:
    clients = CrossAccountClients({"prod": ROLE}, "us-east-1", sts_client=sts)
    with Stubber(sts) as stubber:
        dev = clients.client("s3", "dev")
        assert clients.client("s3", "dev") is dev
        stubber.assert_no_pending_responses()
    assert dev.meta.region_name == "us-east-1"


def test_get_boto3_client_reads_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AWS_REGION", "eu-west-1")
    aws.get_settings.cache_clear()
    aws._clients.cache_clear()
    try:
        assert aws.get_boto3_client("s3", "dev").meta.region_name == "eu-west-1"
    finally:
        aws.get_settings.cache_clear()
        aws._clients.cache_clear()
