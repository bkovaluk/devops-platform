/**
 * Environment signals. Environments come from `/config`, so any name may
 * arrive: the four common ones have their own hue (a monotonic walk — green,
 * sky, violet, rose — so a switcher reads as a spectrum), and any other name
 * takes the neutral `env-other`. Health colours are never an environment's.
 */

export const ALL_ENVS = 'all'

const KNOWN = ['dev', 'qa', 'staging', 'prod'] as const
type KnownEnv = (typeof KNOWN)[number]

function known(env: string): KnownEnv | null {
  return (KNOWN as readonly string[]).includes(env) ? (env as KnownEnv) : null
}

const TEXT: Record<KnownEnv, string> = {
  dev: 'text-env-dev',
  qa: 'text-env-qa',
  staging: 'text-env-staging',
  prod: 'text-env-prod',
}

const DOT: Record<KnownEnv, string> = {
  dev: 'bg-env-dev',
  qa: 'bg-env-qa',
  staging: 'bg-env-staging',
  prod: 'bg-env-prod',
}

export function envTextClass(env: string): string {
  const name = known(env)
  return name ? TEXT[name] : 'text-env-other'
}

export function envDotClass(env: string): string {
  const name = known(env)
  return name ? DOT[name] : 'bg-env-other'
}

/** The tint of the "writes require approval" strip under the top bar. */
export function envBannerClass(env: string): string {
  if (env === 'prod') return 'bg-banner-prod text-env-prod'
  if (env === 'staging') return 'bg-banner-staging text-env-staging'
  return 'bg-banner-other text-env-other'
}

/** The env as a switcher names it: "Staging", or "Prod · Live". */
export function envLabel(env: string): string {
  if (env === ALL_ENVS) return 'All envs'
  if (env === 'qa') return 'QA'
  const word = env.charAt(0).toUpperCase() + env.slice(1)
  return env === 'prod' ? `${word} · Live` : word
}
