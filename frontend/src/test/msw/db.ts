/**
 * The mock's state: flags in three environments, a spread of approval
 * requests in every status, and a deterministic hour of evaluations per flag.
 * Writes change it for the life of the tab (or the test); `resetDb` starts over.
 */
import type { AppConfig, Approval, EvaluationSeries, Flag } from '@/types/api'

export const MOCK_CONFIG: AppConfig = {
  app_name: 'DevOps Platform',
  environments: ['dev', 'staging', 'prod'],
  direct_envs: ['dev'],
}

/** A pending request older than this reads as expired. */
export const APPROVAL_TTL_MS = 72 * 3_600_000

const MINUTE = 60_000

interface FlagSeed {
  key: string
  description: string
  owner: string
  /** [enabled, rollout] per environment. */
  states: Record<string, [boolean, number]>
  /** Base evaluations per minute in prod. */
  traffic: number
}

const SEEDS: readonly FlagSeed[] = [
  {
    key: 'checkout-v2',
    description: 'New checkout flow with saved payment methods.',
    owner: 'payments@example.com',
    states: { dev: [true, 100], staging: [true, 50], prod: [true, 10] },
    traffic: 420,
  },
  {
    key: 'search-ranking-ml',
    description: 'Rank search results with the learned model.',
    owner: 'search@example.com',
    states: { dev: [true, 100], staging: [true, 100], prod: [false, 0] },
    traffic: 980,
  },
  {
    key: 'dark-mode-default',
    description: 'Dark theme as the default for new accounts.',
    owner: 'design@example.com',
    states: { dev: [true, 100], staging: [true, 100], prod: [true, 100] },
    traffic: 260,
  },
  {
    key: 'onboarding-checklist',
    description: 'Guided checklist on a new workspace.',
    owner: 'growth@example.com',
    states: { dev: [true, 100], staging: [false, 0], prod: [false, 0] },
    traffic: 40,
  },
  {
    key: 'payments-retry-backoff',
    description: 'Exponential backoff when the payment provider times out.',
    owner: 'payments@example.com',
    states: { dev: [true, 100], staging: [true, 100], prod: [true, 25] },
    traffic: 150,
  },
  {
    key: 'beta-dashboard',
    description: 'The redesigned dashboard for beta accounts.',
    owner: 'web@example.com',
    states: { dev: [true, 100], staging: [false, 0], prod: [false, 0] },
    traffic: 75,
  },
  {
    key: 'rate-limit-v2',
    description: 'Token-bucket rate limiting at the edge.',
    owner: 'platform@example.com',
    states: { dev: [true, 100], staging: [true, 100], prod: [true, 100] },
    traffic: 1600,
  },
  {
    key: 'eu-data-residency',
    description: 'Route EU tenants to the EU region.',
    owner: 'platform@example.com',
    states: { dev: [false, 0], staging: [false, 0], prod: [false, 0] },
    traffic: 20,
  },
]

const EDITORS = ['lin@example.com', 'grace@example.com', 'ada@example.com']

interface Db {
  flags: Flag[]
  approvals: Approval[]
  sequence: number
  /** The instant the seed was taken; evaluations are counted back from now. */
  seededAt: number
}

function iso(at: number): string {
  return new Date(at).toISOString()
}

function seedFlags(now: number): Flag[] {
  return SEEDS.flatMap((seed, index) =>
    MOCK_CONFIG.environments.map((env, envIndex) => {
      const [enabled, rollout] = seed.states[env] ?? [false, 0]
      // checkout-v2 in staging changed inside the last hour, so its strip
      // carries the change marker.
      const ago =
        seed.key === 'checkout-v2' && env === 'staging'
          ? 23 * MINUTE
          : (index * 7 + envIndex * 3 + 2) * 41 * MINUTE
      return {
        key: seed.key,
        env,
        description: seed.description,
        enabled,
        rollout_percent: rollout,
        owner: seed.owner,
        updated_at: iso(now - ago),
        updated_by: EDITORS[(index + envIndex) % EDITORS.length] ?? 'lin@example.com',
      }
    }),
  )
}

function seedApprovals(now: number, flags: readonly Flag[]): Approval[] {
  const flag = (key: string, env: string) => {
    const found = flags.find((f) => f.key === key && f.env === env)
    return found ? { ...found } : null
  }
  const base = {
    tool: 'flags' as const,
    reviewed_by: null,
    reviewed_at: null,
    review_note: null,
    result: null,
  }
  return [
    {
      ...base,
      id: 'apr_1003',
      env: 'prod',
      action: 'delete',
      target: 'beta-dashboard',
      payload: {},
      before: flag('beta-dashboard', 'prod'),
      status: 'pending',
      requested_by: 'ada@example.com',
      requested_at: iso(now - 15 * MINUTE),
    },
    {
      ...base,
      id: 'apr_1002',
      env: 'staging',
      action: 'create',
      target: 'invoice-pdf-v2',
      payload: {
        key: 'invoice-pdf-v2',
        description: 'Render invoices with the new PDF service.',
        enabled: true,
        rollout_percent: 20,
        owner: 'billing@example.com',
      },
      before: null,
      status: 'pending',
      requested_by: 'lin@example.com',
      requested_at: iso(now - 40 * MINUTE),
    },
    {
      ...base,
      id: 'apr_1001',
      env: 'prod',
      action: 'update',
      target: 'checkout-v2',
      payload: { rollout_percent: 25 },
      before: flag('checkout-v2', 'prod'),
      status: 'pending',
      requested_by: 'grace@example.com',
      requested_at: iso(now - 2 * 60 * MINUTE),
    },
    {
      ...base,
      id: 'apr_0998',
      env: 'staging',
      action: 'update',
      target: 'search-ranking-ml',
      payload: { enabled: true, rollout_percent: 100 },
      before: { ...flag('search-ranking-ml', 'staging'), enabled: false, rollout_percent: 0 },
      status: 'approved',
      requested_by: 'lin@example.com',
      requested_at: iso(now - 26 * 60 * MINUTE),
      reviewed_by: 'grace@example.com',
      reviewed_at: iso(now - 25 * 60 * MINUTE),
      result: 'Applied to staging.',
    },
    {
      ...base,
      id: 'apr_0997',
      env: 'prod',
      action: 'update',
      target: 'rate-limit-v2',
      payload: { rollout_percent: 50 },
      before: flag('rate-limit-v2', 'prod'),
      status: 'rejected',
      requested_by: 'lin@example.com',
      requested_at: iso(now - 30 * 60 * MINUTE),
      reviewed_by: 'ada@example.com',
      reviewed_at: iso(now - 29 * 60 * MINUTE),
      review_note: 'Hold until the load test lands.',
    },
    {
      ...base,
      id: 'apr_0996',
      env: 'staging',
      action: 'update',
      target: 'onboarding-checklist',
      payload: { enabled: true, rollout_percent: 100 },
      before: flag('onboarding-checklist', 'staging'),
      status: 'withdrawn',
      requested_by: 'grace@example.com',
      requested_at: iso(now - 50 * 60 * MINUTE),
      reviewed_by: 'grace@example.com',
      reviewed_at: iso(now - 49 * 60 * MINUTE),
    },
    {
      ...base,
      id: 'apr_0995',
      env: 'prod',
      action: 'update',
      target: 'eu-data-residency',
      payload: { enabled: true, rollout_percent: 5 },
      before: flag('eu-data-residency', 'prod'),
      status: 'pending',
      requested_by: 'lin@example.com',
      requested_at: iso(now - 4 * 24 * 60 * MINUTE),
    },
    {
      ...base,
      id: 'apr_0994',
      env: 'prod',
      action: 'delete',
      target: 'legacy-cart',
      payload: {},
      before: {
        key: 'legacy-cart',
        env: 'prod',
        description: 'The old cart.',
        enabled: false,
        rollout_percent: 0,
        owner: 'web@example.com',
      },
      status: 'failed',
      requested_by: 'grace@example.com',
      requested_at: iso(now - 6 * 24 * 60 * MINUTE),
      reviewed_by: 'ada@example.com',
      reviewed_at: iso(now - 6 * 24 * 60 * MINUTE + 30 * MINUTE),
      result: 'legacy-cart no longer exists in prod.',
    },
  ]
}

function seed(now = Date.now()): Db {
  const flags = seedFlags(now)
  return { flags, approvals: seedApprovals(now, flags), sequence: 1004, seededAt: now }
}

export let db: Db = seed()

export function resetDb(now?: number): void {
  db = seed(now)
}

export function nextApprovalId(): string {
  db.sequence += 1
  return `apr_${db.sequence}`
}

/** A pending request past its time reads as expired. */
export function withExpiry(approval: Approval, now = Date.now()): Approval {
  if (approval.status !== 'pending') return approval
  const age = now - new Date(approval.requested_at).getTime()
  return age > APPROVAL_TTL_MS ? { ...approval, status: 'expired' } : approval
}

/** A small, stable hash, so the same flag's same minute always reads the same. */
function noise(text: string): number {
  let hash = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return ((hash >>> 0) % 10_000) / 10_000
}

const ENV_TRAFFIC: Record<string, number> = { dev: 0.04, staging: 0.2, prod: 1 }

export function evaluationsFor(flag: Flag, minutes: number, now = Date.now()): EvaluationSeries {
  const seedRow = SEEDS.find((s) => s.key === flag.key)
  const base = (seedRow?.traffic ?? 50) * (ENV_TRAFFIC[flag.env] ?? 0.2)
  const newest = Math.floor(now / MINUTE) * MINUTE - MINUTE
  const points = Array.from({ length: minutes }, (_, index) => {
    const at = newest - (minutes - 1 - index) * MINUTE
    const roll = noise(`${flag.env}/${flag.key}/${at}`)
    const quiet = base < 12 && roll < 0.3
    const burst = roll > 0.97 ? 2.6 : 1
    const wave = 1 + 0.25 * Math.sin(index / 6)
    const evaluations = quiet
      ? 0
      : Math.max(1, Math.round(base * wave * burst * (0.75 + roll * 0.5)))
    const share = flag.enabled
      ? Math.min(1, Math.max(0, flag.rollout_percent / 100 + (roll - 0.5) * 0.04))
      : 0
    return {
      t: iso(at),
      evaluations,
      enabled_share: evaluations === 0 ? null : Math.round(share * 1000) / 1000,
    }
  })
  return { key: flag.key, env: flag.env, points }
}
