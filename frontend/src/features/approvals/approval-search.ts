/** The inbox's URL state, validated by the router. */
import { z } from 'zod'

export const approvalsSearchSchema = z.object({
  /** Pending only, or every request. Absent is pending. */
  status: z.enum(['pending', 'all']).optional().catch(undefined),
  /** The request a link points at: opened and marked in the list. */
  id: z.string().optional().catch(undefined),
})
