import { type ClassValue, clsx } from 'clsx'
import { isValidElement, type ReactNode } from 'react'
import { extendTailwindMerge } from 'tailwind-merge'

/** The type steps index.css adds between Tailwind's own. Without them
 *  tailwind-merge reads `text-nano` as a colour and drops it beside one. */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['nano', 'label', 'heading', 'title'] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Whether a slot was given anything that renders. */
export function hasNode(node: ReactNode): boolean {
  if (node === null || node === undefined || node === false || node === '') return false
  if (Array.isArray(node)) return node.some(hasNode)
  return isValidElement(node) || typeof node === 'string' || typeof node === 'number'
}

const RELATIVE = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

const STEPS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
]

/** "3 minutes ago", "yesterday" — against `now`, which tests pin. */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const at = new Date(iso).getTime()
  if (Number.isNaN(at)) return ''
  const seconds = Math.round((at - now) / 1000)
  for (const [unit, size] of STEPS) {
    if (Math.abs(seconds) >= size) return RELATIVE.format(Math.round(seconds / size), unit)
  }
  return 'just now'
}

/** A timestamp in full, UTC, for a hint or an sr-only line. */
export function formatDate(iso: string): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return iso
  return `${at.toISOString().slice(0, 16).replace('T', ' ')} UTC`
}
