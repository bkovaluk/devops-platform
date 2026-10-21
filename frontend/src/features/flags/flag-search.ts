/**
 * The flags tool's URL state, validated by the router. Every key a link can
 * carry is declared here and nowhere else; a component reads them through the
 * route's `useSearch`, never by parsing the URL.
 *
 * `env` is the shell's (the root route's) and is not repeated here.
 */
import { z } from 'zod'

export const FLAG_STATES = ['on', 'off'] as const
export type FlagState = (typeof FLAG_STATES)[number]

export const flagsSearchSchema = z.object({
  /** Text the list is narrowed by: key, description or owner. */
  q: z.string().optional().catch(undefined),
  /** Only flags that are on, or off. Absent is both. */
  state: z.enum(FLAG_STATES).optional().catch(undefined),
  /** The create sheet is open. */
  create: z.boolean().optional().catch(undefined),
})

export const flagSearchSchema = z.object({
  /** The edit sheet is open over the flag. */
  edit: z.boolean().optional().catch(undefined),
})
