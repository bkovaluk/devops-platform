/**
 * The DevOps agent's findings, as `/api/findings` answers them, and the list
 * rules the API applies: one status over a window, triage rows only when
 * asked, facet counts over the window before any narrowing, newest first.
 *
 * Every service here is invented. The set covers each review state, a
 * reported cause with its reasoning and trail, a refused call and a lookup, an
 * incomplete run, a finding triage recorded without investigating, and an
 * earlier closed finding on the same resource for the history.
 */
import type {
  FindingDetail,
  FindingFacets,
  FindingList,
  FindingRow,
  FindingStatus,
  FindingWindow,
  ToolCall,
  ToolTrailStep,
} from '@/types/api'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const WINDOW_MS: Readonly<Record<FindingWindow, number>> = {
  '24h': DAY,
  '7d': 7 * DAY,
  '30d': 30 * DAY,
  '90d': 90 * DAY,
  '365d': 365 * DAY,
}

const TRIAGE_KINDS = ['skipped', 'deferred', 'linked', 'grouped', 'storm']

function iso(at: number): string {
  return new Date(at).toISOString()
}

function call(provider: string, service: string, action: string, subject: string | null): ToolCall {
  return {
    provider,
    service,
    action,
    label: `${provider}.${service}.${action}`,
    subject,
    kind: 'evidence',
    refused: null,
  }
}

function step(
  number: number,
  tool: string,
  status: ToolTrailStep['status'],
  described: ToolCall,
  args: Record<string, unknown>,
): ToolTrailStep {
  const input = Object.entries(args)
    .map(([key, value]) => `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .join(', ')
  return { step: number, tool, status, input, args, call: described }
}

/** A finding with everything the agent leaves empty when it has nothing to say. */
function finding(
  partial: Partial<FindingDetail> &
    Pick<FindingDetail, 'finding_id' | 'env' | 'created_at' | 'status'>,
): FindingDetail {
  const trail = partial.tool_trail ?? []
  return {
    source: 'cloudwatch',
    severity: null,
    title: null,
    alarm_name: null,
    resource_key: null,
    resource_type: null,
    resource_name: null,
    kind: 'alarm',
    outcome: 'reported',
    fix_effort: null,
    confidence: null,
    recurrence_count: 0,
    linked_count: 0,
    alarm_count: null,
    tool_call_count: trail.length,
    tools_used: [...new Set(trail.map((each) => each.tool ?? ''))],
    model: 'opus-5.5',
    steps: trail.length,
    error_signature: null,
    resolution: null,
    resolved_by: null,
    resolved_at: null,
    acknowledged_by: null,
    summary: null,
    likely_cause: null,
    confidence_reason: null,
    hypotheses: [],
    evidence: [],
    suggested_actions: [],
    actions: [],
    checked: [],
    run: null,
    tokens_used: null,
    fix_effort_reason: null,
    severity_floor: null,
    proposed_severity: null,
    alarm_arn: null,
    alarm_reason: null,
    alarm_time: null,
    account_id: null,
    region: 'us-east-1',
    tool_trail: trail,
    sources_with_data: [
      ...new Set(trail.filter((each) => each.status === 'data').map((each) => each.tool ?? '')),
    ],
    prior_finding_ids: [],
    context_summary: null,
    linked_alarms: [],
    member_alarms: [],
    incident_id: null,
    linked_to: null,
    previous_finding_id: null,
    resolution_note: null,
    acknowledged_at: null,
    last_seen_at: null,
    history: [],
    ...partial,
  }
}

function run(stop: string, turns: number, seconds: number, tokens: number) {
  return {
    stop_reason: stop,
    turns,
    max_turns: 14,
    duration_seconds: seconds,
    weighted_tokens: tokens,
    token_budget: 400_000,
  }
}

const ROLLBACK =
  'aws lambda update-alias --function-name checkout-api --name live --function-version 213'

export function seedFindings(now: number): FindingDetail[] {
  const checkoutAt = now - 38 * MINUTE
  const checkoutBefore = finding({
    finding_id: 'f-checkout-0000',
    env: 'prod',
    created_at: iso(now - 9 * DAY - 2 * HOUR),
    status: 'closed',
    severity: 'medium',
    title: 'checkout-api timeouts while the payment provider degraded',
    alarm_name: 'checkout-api-errors',
    resource_key: 'AWS/Lambda:FunctionName=checkout-api',
    resource_type: 'Lambda',
    resource_name: 'checkout-api',
    summary: 'Calls to the payment provider took over 25 seconds for twelve minutes.',
    likely_cause: "The payment provider's API degraded; the function timed out waiting.",
    confidence: 'medium',
    fix_effort: 'unknown',
    resolution: 'confirmed',
    resolved_by: 'grace@example.com',
    resolved_at: iso(now - 9 * DAY - HOUR),
    run: run('chose', 5, 61.2, 88_000),
  })

  const checkout = finding({
    finding_id: 'f-checkout-0001',
    env: 'prod',
    created_at: iso(checkoutAt),
    status: 'open',
    severity: 'high',
    severity_floor: 'medium',
    proposed_severity: 'high',
    title: 'checkout-api errors started with the version 214 deploy',
    alarm_name: 'checkout-api-errors',
    alarm_reason: 'Threshold Crossed: 1 datapoint was greater than or equal to the threshold.',
    alarm_time: iso(checkoutAt - 3 * MINUTE),
    resource_key: 'AWS/Lambda:FunctionName=checkout-api',
    resource_type: 'Lambda',
    resource_name: 'checkout-api',
    summary:
      'Checkout requests fail for carts created before the currency field existed. About **4%** of checkouts error since the deploy.',
    likely_cause:
      "Version 214 reads `cart['currency']` without a default; older carts have no such key.",
    confidence: 'high',
    confidence_reason: 'The error, the line and the deploy time agree.',
    fix_effort: 'low',
    fix_effort_reason: 'A rollback restores service; the code fix is one line.',
    error_signature: "KeyError: 'currency' at checkout/pricing.py:91",
    evidence: [
      { kind: 'metric', detail: 'Errors went from 0 to 37 a minute.', steps: [1] },
      {
        kind: 'log',
        detail: "KeyError: 'currency' at pricing.py line 91 in all 20 recent errors.",
        steps: [2],
      },
      {
        kind: 'change',
        detail: 'PublishVersion 214 three minutes before the errors, by the deploy role.',
        steps: [3],
      },
      {
        kind: 'code',
        detail: "pricing.py line 91 reads cart['currency'] with no default.",
        steps: [6],
      },
      { kind: 'context', detail: 'Two sibling alarms on the function stayed OK.', steps: [] },
    ],
    checked: [
      {
        text: 'No queue or stream feeds the function, so nothing waits to be redriven.',
        steps: [4],
      },
      {
        text: 'The errors start within three minutes of the deploy, and no other change touches the function.',
        steps: [1, 3],
      },
    ],
    hypotheses: [
      {
        text: 'Version 214 broke pricing for carts without a currency',
        state: 'likely',
        steps: [2, 3, 6],
      },
      { text: 'A downstream payment dependency is failing', state: 'ruled_out', steps: [2] },
      { text: 'A queue is replaying bad messages', state: 'ruled_out', steps: [4] },
    ],
    actions: [
      {
        kind: 'change',
        text: 'Point the live alias back to version 213',
        detail: null,
        command: ROLLBACK,
      },
      {
        kind: 'code',
        text: 'Default the currency in pricing.py when a cart has none',
        detail:
          "Read cart.get('currency', store.default_currency) at line 91 and add a test with an old cart.",
        command: null,
      },
    ],
    tool_trail: [
      step(
        1,
        'get_metric',
        'data',
        call('aws', 'cloudwatch', 'get_metric_data', 'checkout-api Errors'),
        { namespace: 'AWS/Lambda', metric: 'Errors', dimension: 'checkout-api' },
      ),
      step(
        2,
        'query_logs',
        'data',
        call('aws', 'logs', 'start_query', '/aws/lambda/checkout-api'),
        {
          log_group: '/aws/lambda/checkout-api',
          filter: 'ERROR',
        },
      ),
      step(
        3,
        'recent_changes',
        'data',
        call('aws', 'cloudtrail', 'lookup_events', 'checkout-api'),
        { resource: 'checkout-api', hours: 6 },
      ),
      step(
        4,
        'aws_call',
        'empty',
        call('aws', 'lambda', 'list_event_source_mappings', 'checkout-api'),
        {
          service: 'lambda',
          operation: 'ListEventSourceMappings',
          params: { FunctionName: 'checkout-api' },
        },
      ),
      step(
        5,
        'aws_find_operation',
        'data',
        { ...call('aws', 'catalog', 'find_operation', 'lambda versions'), kind: 'lookup' },
        { query: 'lambda versions' },
      ),
      step(6, 'github_get_change', 'data', call('github', 'commits', 'get', 'checkout#a41c9e2'), {
        repo: 'checkout',
        sha: 'a41c9e2',
      }),
    ],
    run: run('chose', 7, 84.6, 121_000),
    tokens_used: 612_000,
    context_summary: {
      sections: { metric: 'available', log_patterns: 'available', changes: 'available' },
      counts: { metric: 60, log_patterns: 4, changes: 2 },
      chars: 6200,
      truncated: false,
    },
    previous_finding_id: 'f-checkout-0000',
    prior_finding_ids: ['f-checkout-0000'],
  })

  const ordersAt = now - 3 * HOUR - 12 * MINUTE
  const orders = finding({
    finding_id: 'f-orders-0001',
    env: 'prod',
    created_at: iso(ordersAt),
    status: 'open',
    severity: 'medium',
    severity_floor: 'medium',
    title: 'orders-queue backs up because order-worker is throttled at 5',
    alarm_name: 'orders-queue-age',
    alarm_reason: 'Threshold Crossed: the oldest message was older than 600 seconds.',
    alarm_time: iso(ordersAt - 2 * MINUTE),
    resource_key: 'AWS/SQS:QueueName=orders-queue',
    resource_type: 'SQS',
    resource_name: 'orders-queue',
    summary: 'The oldest order waits 14 minutes; nothing fails, it is only slow.',
    likely_cause: 'Reserved concurrency of 5 on order-worker caps the drain rate.',
    confidence: 'medium',
    confidence_reason: 'Throttles match the backlog; the evening peak is a guess.',
    fix_effort: 'low',
    fix_effort_reason: 'A concurrency setting.',
    recurrence_count: 3,
    last_seen_at: iso(now - 20 * MINUTE),
    evidence: [
      { kind: 'queue', detail: '41,200 visible messages, oldest 14 minutes.', steps: [1] },
      { kind: 'metric', detail: '1,900 throttles in the last hour.', steps: [2] },
      { kind: 'config', detail: 'Reserved concurrency is 5.', steps: [3] },
    ],
    checked: [{ text: 'The worker logged no errors in the window.', steps: [5] }],
    hypotheses: [
      { text: 'The concurrency cap limits the drain rate', state: 'likely', steps: [2, 3] },
      { text: 'Messages fail and return to the queue', state: 'ruled_out', steps: [5] },
      { text: 'Arrivals spiked from an upstream batch', state: 'unverified', steps: [1] },
    ],
    actions: [
      {
        kind: 'approval',
        text: 'Agree a higher reserved concurrency with the orders team',
        detail: null,
        command: null,
      },
      {
        kind: 'change',
        text: 'Raise reserved concurrency to 20',
        detail: null,
        command:
          'aws lambda put-function-concurrency --function-name order-worker --reserved-concurrent-executions 20',
      },
      {
        kind: 'read',
        text: 'Read a sample message body to see which upstream batch sent it',
        detail: 'The agent may not read message bodies.',
        command: null,
      },
    ],
    tool_trail: [
      step(
        1,
        'describe_queue',
        'data',
        call('aws', 'sqs', 'get_queue_attributes', 'orders-queue'),
        {
          queue: 'orders-queue',
        },
      ),
      step(
        2,
        'get_metric',
        'data',
        call('aws', 'cloudwatch', 'get_metric_data', 'order-worker Throttles'),
        { namespace: 'AWS/Lambda', metric: 'Throttles', dimension: 'order-worker' },
      ),
      step(
        3,
        'aws_call',
        'data',
        call('aws', 'lambda', 'get_function_concurrency', 'order-worker'),
        {
          service: 'lambda',
          operation: 'GetFunctionConcurrency',
          params: { FunctionName: 'order-worker' },
        },
      ),
      step(
        4,
        'aws_call',
        'error',
        {
          ...call('aws', 'sqs', 'receive_message', 'orders-queue'),
          refused: 'reads message bodies',
        },
        { service: 'sqs', operation: 'ReceiveMessage', params: { QueueUrl: 'orders-queue' } },
      ),
      step(
        5,
        'query_logs',
        'empty',
        call('aws', 'logs', 'start_query', '/aws/lambda/order-worker'),
        {
          log_group: '/aws/lambda/order-worker',
          filter: 'ERROR',
        },
      ),
    ],
    run: run('chose', 6, 52.3, 74_000),
    tokens_used: 301_000,
  })

  const payments = finding({
    finding_id: 'f-payments-0001',
    env: 'staging',
    created_at: iso(now - 5 * HOUR),
    status: 'open',
    source: 'datadog',
    severity: 'high',
    severity_floor: 'high',
    title: 'payments-worker error rate from an expired sandbox credential',
    alarm_name: 'payments-worker error rate {env:staging}',
    resource_key: 'datadog:monitor/4412/env:staging',
    resource_type: 'Datadog',
    resource_name: 'payments-worker error rate {env:staging}',
    summary: 'Every call to the payment sandbox answers 401 since the credential rotated.',
    likely_cause: 'The sandbox API key in staging expired and was not replaced.',
    confidence: 'high',
    fix_effort: 'low',
    fix_effort_reason: 'Rotate one secret.',
    evidence: [{ kind: 'log', detail: '401 Unauthorized on every sandbox call.', steps: [1] }],
    hypotheses: [
      { text: 'The sandbox credential expired', state: 'likely', steps: [1] },
      { text: 'The sandbox itself is down', state: 'ruled_out', steps: [2] },
    ],
    actions: [
      {
        kind: 'change',
        text: 'Rotate the sandbox key for payments-worker in staging',
        detail: null,
        command: null,
      },
    ],
    tool_trail: [
      step(1, 'search_datadog_logs', 'data', call('datadog', 'logs', 'search', 'payments-worker'), {
        service: 'payments-worker',
        env: 'staging',
        status: 'error',
      }),
      step(
        2,
        'datadog_monitor_status',
        'data',
        call('datadog', 'monitors', 'get', 'payments sandbox uptime'),
        { monitor: 'payments sandbox uptime' },
      ),
    ],
    run: run('chose', 3, 28.4, 39_000),
  })

  const billing = finding({
    finding_id: 'f-billing-0001',
    env: 'staging',
    created_at: iso(now - 7 * HOUR),
    status: 'open',
    severity: 'medium',
    title: 'Investigation incomplete: billing-db-cpu-high',
    alarm_name: 'billing-db-cpu-high',
    resource_key: 'AWS/RDS:DBInstanceIdentifier=billing-db',
    resource_type: 'RDS',
    resource_name: 'billing-db',
    summary: 'The investigation of billing-db-cpu-high did not finish and reported no finding.',
    likely_cause: 'Not determined.',
    outcome: 'incomplete',
    fix_effort: 'unknown',
    actions: [
      {
        kind: 'read',
        text: 'Open the alarm billing-db-cpu-high in the CloudWatch console.',
        detail: null,
        command: null,
      },
    ],
    tool_trail: [
      step(
        1,
        'describe_database',
        'data',
        call('aws', 'rds', 'describe_db_instances', 'billing-db'),
        { identifier: 'billing-db' },
      ),
      step(
        2,
        'get_metric',
        'error',
        call('aws', 'cloudwatch', 'get_metric_data', 'billing-db CPUUtilization'),
        { namespace: 'AWS/RDS', metric: 'CPUUtilization', dimension: 'billing-db' },
      ),
    ],
    run: run('turn_limit', 14, 210.4, 390_000),
    tokens_used: 1_480_000,
  })

  const searchAt = now - 26 * HOUR
  const search = finding({
    finding_id: 'f-search-0001',
    env: 'prod',
    created_at: iso(searchAt),
    status: 'acknowledged',
    severity: 'critical',
    severity_floor: 'high',
    proposed_severity: 'critical',
    title: 'search-cluster JVM pressure from an unbounded aggregation',
    alarm_name: 'search-cluster-jvm-pressure',
    resource_key: 'AWS/ES:DomainName=search-cluster',
    resource_type: 'ES',
    resource_name: 'search-cluster',
    summary: 'Heap stays above 92% on all three data nodes; queries slow down.',
    likely_cause: 'A terms aggregation over a high-cardinality field holds most of the heap.',
    confidence: 'low',
    confidence_reason: 'The slow log points at it; no heap dump confirms it.',
    fix_effort: 'medium',
    fix_effort_reason: 'A query change and a mapping review.',
    hypotheses: [
      { text: 'One aggregation holds most of the heap', state: 'likely', steps: [] },
      { text: 'A node is undersized for its shards', state: 'unverified', steps: [] },
    ],
    acknowledged_by: 'lin@example.com',
    acknowledged_at: iso(searchAt + 30 * MINUTE),
    run: run('token_budget', 11, 141, 400_000),
  })

  const reports = finding({
    finding_id: 'f-reports-0001',
    env: 'dev',
    created_at: iso(now - 2 * HOUR),
    status: 'open',
    severity: 'low',
    title: 'report-builder slower since the dataset doubled',
    alarm_name: 'report-builder-duration',
    resource_key: 'AWS/Lambda:FunctionName=report-builder',
    resource_type: 'Lambda',
    resource_name: 'report-builder',
    summary: 'The nightly report takes 11 minutes, up from 5.',
    likely_cause: 'The source table doubled in rows after the import.',
    confidence: 'medium',
    fix_effort: 'medium',
    fix_effort_reason: 'Paginate the export.',
    run: run('chose', 4, 33, 41_000),
  })

  const notify = finding({
    finding_id: 'f-notify-0001',
    env: 'prod',
    created_at: iso(now - HOUR),
    status: 'open',
    kind: 'skipped',
    outcome: 'triaged',
    severity: 'low',
    title: 'Skipped: notifications-dlq-depth is opted out',
    alarm_name: 'notifications-dlq-depth',
    resource_key: 'AWS/SQS:QueueName=notifications-dlq',
    resource_type: 'SQS',
    resource_name: 'notifications-dlq',
    summary: 'The alarm is tagged DevOpsAgent=off, so it was not investigated.',
    likely_cause: 'Not investigated.',
    fix_effort: 'unknown',
    model: null,
  })

  const resizer = finding({
    finding_id: 'f-resizer-0001',
    env: 'staging',
    created_at: iso(now - 2 * DAY - 5 * HOUR),
    status: 'closed',
    severity: 'low',
    title: 'image-resizer runs long on very large uploads',
    alarm_name: 'image-resizer-duration',
    resource_key: 'AWS/Lambda:FunctionName=image-resizer',
    resource_type: 'Lambda',
    resource_name: 'image-resizer',
    likely_cause: 'Large uploads are resized in one pass in memory.',
    confidence: 'high',
    fix_effort: 'medium',
    resolution: 'confirmed',
    resolution_note: 'Matches what we saw; ticket filed.',
    resolved_by: 'ada@example.com',
    resolved_at: iso(now - 2 * DAY - HOUR),
  })

  const gateway = finding({
    finding_id: 'f-gateway-0001',
    env: 'prod',
    created_at: iso(now - 5 * DAY),
    status: 'closed',
    severity: 'high',
    title: 'public-api 5xx during the planned maintenance window',
    alarm_name: 'public-api-5xx',
    resource_key: 'AWS/ApiGateway:ApiName=public-api',
    resource_type: 'ApiGateway',
    resource_name: 'public-api',
    likely_cause: 'Planned maintenance on the backend cluster.',
    confidence: 'medium',
    fix_effort: 'unknown',
    resolution: 'false_positive',
    resolved_by: 'grace@example.com',
    resolved_at: iso(now - 5 * DAY + HOUR),
  })

  const all = [
    checkout,
    orders,
    payments,
    billing,
    search,
    reports,
    notify,
    resizer,
    gateway,
    checkoutBefore,
  ]
  return all.map((each) => ({ ...each, history: historyOf(each, all) }))
}

function historyOf(item: FindingDetail, all: readonly FindingDetail[]): FindingDetail['history'] {
  return all
    .filter(
      (other) =>
        other.env === item.env &&
        other.resource_key === item.resource_key &&
        other.finding_id !== item.finding_id &&
        other.created_at < item.created_at,
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 5)
    .map((other) => ({
      finding_id: other.finding_id,
      created_at: other.created_at,
      title: other.title ?? null,
      status: other.status,
      resolution: other.resolution ?? null,
      outcome: other.outcome ?? null,
    }))
}

/** A finding as its list row: the detail without what only the detail carries. */
export function rowOf(item: FindingDetail): FindingRow {
  return {
    finding_id: item.finding_id,
    env: item.env,
    created_at: item.created_at,
    status: item.status,
    source: item.source,
    severity: item.severity,
    title: item.title,
    alarm_name: item.alarm_name,
    resource_key: item.resource_key,
    resource_type: item.resource_type,
    resource_name: item.resource_name,
    kind: item.kind,
    outcome: item.outcome,
    fix_effort: item.fix_effort,
    confidence: item.confidence,
    recurrence_count: item.recurrence_count,
    linked_count: item.linked_count,
    alarm_count: item.alarm_count,
    tool_call_count: item.tool_call_count,
    tools_used: item.tools_used,
    model: item.model,
    steps: item.steps,
    error_signature: item.error_signature,
    resolution: item.resolution,
    resolved_by: item.resolved_by,
    resolved_at: item.resolved_at,
    acknowledged_by: item.acknowledged_by,
  }
}

const FACETS = [
  ['severity', 'severity'],
  ['outcome', 'outcome'],
  ['effort', 'fix_effort'],
  ['confidence', 'confidence'],
  ['type', 'resource_type'],
  ['model', 'model'],
  ['resolution', 'resolution'],
  ['resolved_by', 'resolved_by'],
] as const

function kindMatches(row: FindingRow, wanted: readonly string[]): boolean {
  return (
    wanted.length === 0 ||
    wanted.includes(row.kind ?? 'alarm') ||
    (wanted.includes('has_linked') && (row.linked_count ?? 0) > 0) ||
    (wanted.includes('repeating') && (row.recurrence_count ?? 0) > 0)
  )
}

function facetsOf(rows: readonly FindingRow[]): FindingFacets {
  const counts: Record<string, Record<string, number>> = {}
  const tally = (facet: string, value: string | null | undefined) => {
    if (value === null || value === undefined) return
    const facetCounts = (counts[facet] ??= {})
    facetCounts[value] = (facetCounts[value] ?? 0) + 1
  }
  for (const row of rows) {
    for (const [facet, field] of FACETS) tally(facet, row[field])
    tally('kind', row.kind)
    if ((row.linked_count ?? 0) > 0) tally('kind', 'has_linked')
    if ((row.recurrence_count ?? 0) > 0) tally('kind', 'repeating')
    for (const tool of new Set(row.tools_used ?? [])) tally('tool', tool)
  }
  return counts as FindingFacets
}

export interface FindingsAsk {
  envs: readonly string[]
  selector: string
  status: FindingStatus
  window: FindingWindow
  triage: boolean
  filters: Readonly<Record<string, readonly string[]>>
  q: string
  offset: number
  limit: number
}

export function listFindings(
  findings: readonly FindingDetail[],
  ask: FindingsAsk,
  now = Date.now(),
): FindingList {
  const since = now - WINDOW_MS[ask.window]
  const rows = findings
    .filter((item) => ask.envs.includes(item.env) && item.status === ask.status)
    .filter((item) => Date.parse(item.created_at) >= since)
    .map(rowOf)
  const kinds = ask.filters.kind ?? []
  const inWindow = rows.filter(
    (row) =>
      !TRIAGE_KINDS.includes(row.kind ?? 'alarm') || ask.triage || kinds.includes(row.kind ?? ''),
  )
  const among = (value: string | null | undefined, wanted: readonly string[] | undefined) =>
    !wanted ||
    wanted.length === 0 ||
    (value !== null && value !== undefined && wanted.includes(value))
  const tools = ask.filters.tool ?? []
  const needle = ask.q.trim().toLowerCase()
  const matching = inWindow
    .filter(
      (row) =>
        FACETS.every(([facet, field]) => among(row[field], ask.filters[facet])) &&
        kindMatches(row, kinds) &&
        (tools.length === 0 || (row.tools_used ?? []).some((tool) => tools.includes(tool))) &&
        (!needle ||
          [row.title, row.alarm_name, row.resource_name, row.error_signature].some((field) =>
            field?.toLowerCase().includes(needle),
          )),
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
  return {
    env: ask.selector,
    status: ask.status,
    window: ask.window,
    items: matching.slice(ask.offset, ask.offset + ask.limit),
    total: matching.length,
    facets: facetsOf(inWindow),
    truncated: false,
  }
}
