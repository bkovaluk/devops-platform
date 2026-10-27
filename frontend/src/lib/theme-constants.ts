/**
 * Tool identity. A tool's accent colours its icon — in the rail, on a Home
 * tile, beside a palette command — and nothing else: never a label, never a
 * backplate, never a state. Light mode boosts these -400 steps in index.css.
 *
 * A new tool picks an accent here and names it on its registry entry.
 */
export const TOOL_ACCENTS = {
  brand: { text: 'text-emerald-400' },
  flags: { text: 'text-cyan-400' },
  approvals: { text: 'text-amber-400' },
  investigations: { text: 'text-indigo-400' },
} as const satisfies Record<string, { text: string }>

export type ToolAccent = keyof typeof TOOL_ACCENTS
