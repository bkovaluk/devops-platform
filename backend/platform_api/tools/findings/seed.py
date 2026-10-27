"""Example findings for a fresh in-memory run, shaped as the DevOps agent writes them.

Every service named here is invented. The examples cover each review state, a
reported cause with its reasoning and tool trail, an incomplete run, a finding
triage recorded without investigating, and an earlier closed finding on the
same resource so the history has something in it.
"""

from datetime import datetime, timedelta
from typing import Any, Final

from platform_api.tools.findings.items import Item, finding_key, snapshot_key
from platform_api.tools.findings.store import MemoryFindingStore

MODEL: Final = "us.anthropic.claude-opus-5-5"
REGION: Final = "us-east-1"
OPEN_RETENTION: Final = timedelta(days=90)
CLOSED_RETENTION: Final = timedelta(days=365)


def _call(provider: str, service: str, action: str, subject: str | None) -> dict[str, Any]:
    return {
        "provider": provider,
        "service": service,
        "action": action,
        "label": f"{provider}.{service}.{action}",
        "subject": subject,
        "kind": "evidence",
        "refused": None,
    }


def _step(
    step: int,
    tool: str,
    status: str,
    call: dict[str, Any],
    args: dict[str, Any],
) -> dict[str, Any]:
    summary = ", ".join(f"{key}={value}" for key, value in args.items())
    return {
        "step": step,
        "tool": tool,
        "status": status,
        "input": summary[:200],
        "args": args,
        "call": call,
    }


def _run(stop_reason: str, turns: int, seconds: float, tokens: int) -> dict[str, Any]:
    return {
        "stop_reason": stop_reason,
        "turns": turns,
        "max_turns": 14,
        "duration_seconds": seconds,
        "weighted_tokens": tokens,
        "token_budget": 400_000,
    }


def _context(**counts: int) -> dict[str, Any]:
    return {
        "sections": {name: "available" for name in counts},
        "counts": counts,
        "chars": 6_200,
        "truncated": False,
    }


def _base(finding_id: str, env: str, created: datetime, **fields: Any) -> Item:
    trail = fields.get("tool_trail", [])
    return {
        "pk": finding_key(finding_id),
        "finding_id": finding_id,
        "created_at": created.isoformat(),
        "env": env,
        "source": "cloudwatch",
        "account_id": None,
        "region": REGION,
        "kind": "alarm",
        "status": "open",
        "outcome": "reported",
        "model_id": MODEL,
        "steps": len(trail),
        "tool_call_count": len(trail),
        "tools_used": list(dict.fromkeys(step["tool"] for step in trail)),
        "sources_with_data": list(
            dict.fromkeys(step["tool"] for step in trail if step["status"] == "data")
        ),
        "recurrence_count": 0,
        "linked_alarms": [],
        "member_alarms": [],
        "evidence": [],
        "checked": [],
        "actions": [],
        "suggested_actions": [],
        "hypotheses": [],
        "prior_finding_ids": [],
        "resolution": None,
        "resolved_at": None,
        "resolved_by": None,
        "ttl": int((created + OPEN_RETENTION).timestamp()),
        **fields,
    }


ROLLBACK: Final = (
    "aws lambda update-alias --function-name checkout-api --name live --function-version 213"
)


def _checkout(env: str, now: datetime) -> Item:
    created = now - timedelta(minutes=38)
    trail = [
        _step(
            1,
            "get_metric",
            "data",
            _call("aws", "cloudwatch", "get_metric_data", "checkout-api Errors"),
            {"namespace": "AWS/Lambda", "metric": "Errors", "dimension": "checkout-api"},
        ),
        _step(
            2,
            "query_logs",
            "data",
            _call("aws", "logs", "start_query", "/aws/lambda/checkout-api"),
            {"log_group": "/aws/lambda/checkout-api", "filter": "ERROR"},
        ),
        _step(
            3,
            "recent_changes",
            "data",
            _call("aws", "cloudtrail", "lookup_events", "checkout-api"),
            {"resource": "checkout-api", "hours": 6},
        ),
        _step(
            4,
            "aws_call",
            "empty",
            _call("aws", "lambda", "list_event_source_mappings", "checkout-api"),
            {
                "service": "lambda",
                "operation": "ListEventSourceMappings",
                "params": {"FunctionName": "checkout-api"},
            },
        ),
        _step(
            5,
            "github_get_change",
            "data",
            _call("github", "commits", "get", "checkout#a41c9e2"),
            {"repo": "checkout", "sha": "a41c9e2"},
        ),
    ]
    return _base(
        "f-checkout-0001",
        env,
        created,
        alarm_name="checkout-api-errors",
        alarm_reason="Threshold Crossed: 1 datapoint was greater than or equal to the threshold.",
        alarm_time=(created - timedelta(minutes=3)).isoformat(),
        resource_key="AWS/Lambda:FunctionName=checkout-api",
        severity="high",
        severity_floor="medium",
        proposed_severity="high",
        title="checkout-api errors started with the version 214 deploy",
        summary=(
            "Checkout requests fail for carts created before the currency field existed. "
            "About **4%** of checkouts error since 13:01 UTC."
        ),
        likely_cause=(
            "Version 214 reads `cart['currency']` without a default; older carts have no such key."
        ),
        confidence="high",
        confidence_reason="The error, the line and the deploy time agree.",
        fix_effort="low",
        fix_effort_reason="A rollback restores service; the code fix is one line.",
        error_signature="KeyError: 'currency' at checkout/pricing.py:91",
        evidence=[
            {"kind": "metric", "detail": "Errors went from 0 to 37 a minute.", "steps": [1]},
            {
                "kind": "log",
                "detail": "KeyError: 'currency' at pricing.py line 91 in all 20 recent errors.",
                "steps": [2],
            },
            {
                "kind": "change",
                "detail": "PublishVersion 214 three minutes before the errors, by the deploy role.",
                "steps": [3],
            },
            {
                "kind": "code",
                "detail": "pricing.py line 91 reads cart['currency'] with no default.",
                "steps": [5],
            },
            {"kind": "context", "detail": "Two sibling alarms on the function stayed OK."},
        ],
        checked=[
            {
                "text": "No queue or stream feeds the function, so nothing waits to be redriven.",
                "steps": [4],
            },
            {
                "text": "The errors start within three minutes of the deploy, and no other "
                "change touches the function.",
                "steps": [1, 3],
            },
        ],
        hypotheses=[
            {
                "text": "Version 214 broke pricing for carts without a currency",
                "state": "likely",
                "steps": [2, 3, 5],
            },
            {
                "text": "A downstream payment dependency is failing",
                "state": "ruled_out",
                "steps": [2],
            },
            {"text": "A queue is replaying bad messages", "state": "ruled_out", "steps": [4]},
        ],
        actions=[
            {
                "kind": "change",
                "text": "Point the live alias back to version 213",
                "detail": None,
                "command": ROLLBACK,
            },
            {
                "kind": "code",
                "text": "Default the currency in pricing.py when a cart has none",
                "detail": "Read cart.get('currency', store.default_currency) at line 91 and "
                "add a test with an old cart.",
                "command": None,
            },
        ],
        suggested_actions=[
            f"Point the live alias back to version 213: {ROLLBACK}",
            "Default the currency in pricing.py when a cart has none",
        ],
        tool_trail=trail,
        run=_run("chose", 6, 84.6, 121_000),
        tokens_used=612_000,
        context_summary=_context(metric=60, log_patterns=4, changes=2, siblings=2),
        previous_finding_id="f-checkout-0000",
        prior_finding_ids=["f-checkout-0000"],
    )


def _checkout_before(env: str, now: datetime) -> Item:
    created = now - timedelta(days=9, hours=2)
    closed = created + timedelta(hours=1)
    return _base(
        "f-checkout-0000",
        env,
        created,
        alarm_name="checkout-api-errors",
        resource_key="AWS/Lambda:FunctionName=checkout-api",
        severity="medium",
        severity_floor="medium",
        title="checkout-api timeouts while the payment provider degraded",
        summary="Calls to the payment provider took over 25 seconds for twelve minutes.",
        likely_cause="The payment provider's API degraded; the function timed out waiting.",
        confidence="medium",
        fix_effort="unknown",
        fix_effort_reason="",
        status="closed",
        resolution="confirmed",
        resolved_at=closed.isoformat(),
        resolved_by="grace@example.com",
        ttl=int((closed + CLOSED_RETENTION).timestamp()),
        run=_run("chose", 5, 61.2, 88_000),
    )


def _orders(env: str, now: datetime) -> Item:
    created = now - timedelta(hours=3, minutes=12)
    trail = [
        _step(
            1,
            "describe_queue",
            "data",
            _call("aws", "sqs", "get_queue_attributes", "orders-queue"),
            {"queue": "orders-queue"},
        ),
        _step(
            2,
            "get_metric",
            "data",
            _call("aws", "cloudwatch", "get_metric_data", "order-worker Throttles"),
            {"namespace": "AWS/Lambda", "metric": "Throttles", "dimension": "order-worker"},
        ),
        _step(
            3,
            "aws_call",
            "data",
            _call("aws", "lambda", "get_function_concurrency", "order-worker"),
            {
                "service": "lambda",
                "operation": "GetFunctionConcurrency",
                "params": {"FunctionName": "order-worker"},
            },
        ),
        _step(
            4,
            "query_logs",
            "empty",
            _call("aws", "logs", "start_query", "/aws/lambda/order-worker"),
            {"log_group": "/aws/lambda/order-worker", "filter": "ERROR"},
        ),
    ]
    return _base(
        "f-orders-0001",
        env,
        created,
        alarm_name="orders-queue-age",
        alarm_reason="Threshold Crossed: the oldest message was older than 600 seconds.",
        alarm_time=(created - timedelta(minutes=2)).isoformat(),
        resource_key="AWS/SQS:QueueName=orders-queue",
        severity="medium",
        severity_floor="medium",
        proposed_severity="medium",
        title="orders-queue backs up because order-worker is throttled at 5",
        summary="The oldest order waits 14 minutes; nothing fails, it is only slow.",
        likely_cause="Reserved concurrency of 5 on order-worker caps the drain rate.",
        confidence="medium",
        confidence_reason="Throttles match the backlog; the evening peak is a guess.",
        fix_effort="low",
        fix_effort_reason="A concurrency setting.",
        evidence=[
            {
                "kind": "queue",
                "detail": "41,200 visible messages, oldest 14 minutes.",
                "steps": [1],
            },
            {"kind": "metric", "detail": "1,900 throttles in the last hour.", "steps": [2]},
            {"kind": "config", "detail": "Reserved concurrency is 5.", "steps": [3]},
        ],
        checked=[{"text": "The worker logged no errors in the window.", "steps": [4]}],
        hypotheses=[
            {
                "text": "The concurrency cap limits the drain rate",
                "state": "likely",
                "steps": [2, 3],
            },
            {"text": "Messages fail and return to the queue", "state": "ruled_out", "steps": [4]},
            {"text": "Arrivals spiked from an upstream batch", "state": "unverified", "steps": [1]},
        ],
        actions=[
            {
                "kind": "approval",
                "text": "Agree a higher reserved concurrency with the orders team",
                "detail": None,
                "command": None,
            },
            {
                "kind": "change",
                "text": "Raise reserved concurrency to 20",
                "detail": None,
                "command": "aws lambda put-function-concurrency --function-name order-worker "
                "--reserved-concurrent-executions 20",
            },
        ],
        tool_trail=trail,
        run=_run("chose", 5, 52.3, 74_000),
        tokens_used=301_000,
        recurrence_count=3,
        last_seen_at=(now - timedelta(minutes=20)).isoformat(),
        context_summary=_context(metric=60, siblings=1),
    )


def _billing(env: str, now: datetime) -> Item:
    created = now - timedelta(hours=7)
    trail = [
        _step(
            1,
            "describe_database",
            "data",
            _call("aws", "rds", "describe_db_instances", "billing-db"),
            {"identifier": "billing-db"},
        ),
        _step(
            2,
            "get_metric",
            "error",
            _call("aws", "cloudwatch", "get_metric_data", "billing-db CPUUtilization"),
            {"namespace": "AWS/RDS", "metric": "CPUUtilization", "dimension": "billing-db"},
        ),
    ]
    return _base(
        "f-billing-0001",
        env,
        created,
        alarm_name="billing-db-cpu-high",
        resource_key="AWS/RDS:DBInstanceIdentifier=billing-db",
        severity="medium",
        severity_floor="medium",
        title="Investigation incomplete: billing-db-cpu-high",
        summary="The investigation of billing-db-cpu-high did not finish and reported no finding.",
        likely_cause="Not determined.",
        fix_effort="unknown",
        fix_effort_reason="",
        outcome="incomplete",
        actions=[
            {
                "kind": "read",
                "text": "Open the alarm billing-db-cpu-high in the CloudWatch console.",
                "detail": None,
                "command": None,
            }
        ],
        tool_trail=trail,
        run=_run("turn_limit", 14, 210.4, 390_000),
        tokens_used=1_480_000,
    )


def _search(env: str, now: datetime) -> Item:
    created = now - timedelta(hours=26)
    acknowledged = created + timedelta(minutes=30)
    return _base(
        "f-search-0001",
        env,
        created,
        alarm_name="search-cluster-jvm-pressure",
        resource_key="AWS/ES:DomainName=search-cluster",
        severity="critical",
        severity_floor="high",
        proposed_severity="critical",
        title="search-cluster JVM pressure from an unbounded aggregation",
        summary="Heap stays above 92% on all three data nodes; queries slow down.",
        likely_cause="A terms aggregation over a high-cardinality field holds most of the heap.",
        confidence="low",
        confidence_reason="The slow log points at it; no heap dump confirms it.",
        fix_effort="medium",
        fix_effort_reason="A query change and a mapping review.",
        hypotheses=[
            {"text": "One aggregation holds most of the heap", "state": "likely", "steps": []},
            {"text": "A node is undersized for its shards", "state": "unverified", "steps": []},
        ],
        status="acknowledged",
        acknowledged_at=acknowledged.isoformat(),
        acknowledged_by="lin@example.com",
        ttl=int((acknowledged + OPEN_RETENTION).timestamp()),
        run=_run("token_budget", 11, 141.0, 400_000),
    )


def _resizer(env: str, now: datetime) -> Item:
    created = now - timedelta(days=2, hours=5)
    closed = created + timedelta(hours=4)
    return _base(
        "f-resizer-0001",
        env,
        created,
        alarm_name="image-resizer-duration",
        resource_key="AWS/Lambda:FunctionName=image-resizer",
        severity="low",
        severity_floor="low",
        title="image-resizer runs long on very large uploads",
        summary="Three uploads over 40 MB took more than 25 seconds.",
        likely_cause="Large uploads are resized in one pass in memory.",
        confidence="high",
        fix_effort="medium",
        fix_effort_reason="Stream the resize.",
        status="closed",
        resolution="confirmed",
        resolution_note="Matches what we saw; ticket filed.",
        resolved_at=closed.isoformat(),
        resolved_by="ada@example.com",
        ttl=int((closed + CLOSED_RETENTION).timestamp()),
        run=_run("chose", 4, 40.1, 52_000),
    )


def _gateway(env: str, now: datetime) -> Item:
    created = now - timedelta(days=5)
    closed = created + timedelta(hours=1)
    return _base(
        "f-gateway-0001",
        env,
        created,
        alarm_name="public-api-5xx",
        resource_key="AWS/ApiGateway:ApiName=public-api",
        severity="high",
        severity_floor="high",
        title="public-api 5xx during the planned maintenance window",
        summary="Errors lasted the six minutes of the announced maintenance.",
        likely_cause="Planned maintenance on the backend cluster.",
        confidence="medium",
        fix_effort="unknown",
        fix_effort_reason="",
        status="closed",
        resolution="false_positive",
        resolved_at=closed.isoformat(),
        resolved_by="grace@example.com",
        ttl=int((closed + CLOSED_RETENTION).timestamp()),
    )


def _reports(env: str, now: datetime) -> Item:
    created = now - timedelta(hours=2)
    return _base(
        "f-reports-0001",
        env,
        created,
        alarm_name="report-builder-duration",
        resource_key="AWS/Lambda:FunctionName=report-builder",
        severity="low",
        severity_floor="low",
        title="report-builder slower since the dataset doubled",
        summary="The nightly report takes 11 minutes, up from 5.",
        likely_cause="The source table doubled in rows after the import.",
        confidence="medium",
        fix_effort="medium",
        fix_effort_reason="Paginate the export.",
        run=_run("chose", 4, 33.0, 41_000),
    )


def _skipped(env: str, now: datetime) -> Item:
    created = now - timedelta(hours=1)
    return _base(
        "f-notify-0001",
        env,
        created,
        kind="skipped",
        outcome="triaged",
        alarm_name="notifications-dlq-depth",
        resource_key="AWS/SQS:QueueName=notifications-dlq",
        severity="low",
        severity_floor="low",
        title="Skipped: notifications-dlq-depth is opted out",
        summary="The alarm is tagged DevOpsAgent=off, so it was not investigated.",
        likely_cause="Not investigated.",
        fix_effort="unknown",
        fix_effort_reason="",
        model_id="",
    )


def _snapshot(finding: Item, now: datetime) -> Item:
    return {
        "pk": snapshot_key(str(finding["finding_id"])),
        "finding_id": finding["finding_id"],
        "created_at": finding["created_at"],
        "snapshot": "{}",
        "ttl": int((now + OPEN_RETENTION).timestamp()),
    }


def example_findings(environments: list[str], now: datetime) -> list[tuple[str, Item]]:
    """The examples, each in the env that suits it: the lowest, a middle one, the highest."""
    lowest, highest = environments[0], environments[-1]
    middle = environments[len(environments) // 2] if len(environments) > 2 else highest
    return [
        (highest, _checkout(highest, now)),
        (highest, _checkout_before(highest, now)),
        (highest, _orders(highest, now)),
        (middle, _billing(middle, now)),
        (highest, _search(highest, now)),
        (middle, _resizer(middle, now)),
        (highest, _gateway(highest, now)),
        (lowest, _reports(lowest, now)),
        (highest, _skipped(highest, now)),
    ]


def seed_examples(store: MemoryFindingStore, environments: list[str], now: datetime) -> None:
    """The examples, and a snapshot beside every reported finding still under review."""
    for env, finding in example_findings(environments, now):
        store.put(env, finding)
        if finding.get("outcome") == "reported" and finding.get("status") != "closed":
            store.put(env, _snapshot(finding, now))
