"""What the DynamoDB-backed stores share: the client and how failures read.

Every store uses one table with a string partition key ``pk`` and sort key
``sk``. A record is kept whole as JSON in ``doc``; attributes a condition
needs (``status``) are copied beside it.
"""

import logging
from typing import Any

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from platform_api.config import Settings
from platform_api.errors import UpstreamError

logger = logging.getLogger(__name__)


def dynamodb_client(settings: Settings) -> Any:
    """A DynamoDB client; ``AWS_ENDPOINT_URL`` points it at a local emulator."""
    return boto3.client("dynamodb", region_name=settings.aws_region)


def is_condition_failure(exc: ClientError) -> bool:
    return bool(exc.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException")


def upstream(exc: ClientError | BotoCoreError, doing: str) -> UpstreamError:
    logger.error("storage.failed", extra={"fields": {"doing": doing}}, exc_info=exc)
    return UpstreamError(f"The data store failed while {doing}; try again in a moment.")
