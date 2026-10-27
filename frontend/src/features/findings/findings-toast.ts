import { notifyWithLink } from '@/lib/notify'
import type { FindingDetail } from '@/types/api'
import { resolutionWord } from './findings-words'

/** The toast for a review that landed, linking the finding it landed on. */
export function findingReviewed(finding: FindingDetail): void {
  const title =
    finding.status === 'closed'
      ? `Closed as ${resolutionWord(finding.resolution ?? null).toLowerCase()} in ${finding.env}`
      : `Acknowledged in ${finding.env}`
  notifyWithLink({
    title,
    resource: { kind: 'finding', id: finding.finding_id, env: finding.env },
    linkLabel: 'Open investigation',
  })
}
