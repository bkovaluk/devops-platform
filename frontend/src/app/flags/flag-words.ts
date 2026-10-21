import type { ChipTone } from '@/components/ui/chip'
import type { StateTone } from '@/components/ui/state-mark'
import type { Flag } from '@/types/api'

/** A flag's standing as one word and one value: "On", "On · 25%", "Off". */
export function flagStateWord(flag: Pick<Flag, 'enabled' | 'rollout_percent'>): string {
  if (!flag.enabled) return 'Off'
  return flag.rollout_percent >= 100 ? 'On' : `On · ${flag.rollout_percent}%`
}

export function flagChipTone(flag: Pick<Flag, 'enabled' | 'rollout_percent'>): ChipTone {
  if (!flag.enabled) return 'neutral'
  return flag.rollout_percent >= 100 ? 'ok' : 'info'
}

export function flagStateTone(flag: Pick<Flag, 'enabled'>): StateTone {
  return flag.enabled ? 'ok' : 'unknown'
}

/** Flag keys: lower case, digits, dot, dash and underscore, starting with a
 *  letter or digit. */
export const FLAG_KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{1,62}$/
