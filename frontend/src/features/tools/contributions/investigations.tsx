/**
 * What Investigations lends to the shared surfaces: the open queue, read
 * across every environment the principal can read. A contribution never reads
 * another tool's data.
 */
import { Siren } from 'lucide-react'
import { NO_FILTERS, paramsOf } from '@/features/findings/findings-search'
import { useFindings } from '@/features/findings/use-findings'
import { ALL_ENVS } from '@/lib/env'
import { TOOL_ACCENTS } from '@/lib/theme-constants'
import { AttentionTile, HomeToolTile } from '../home-parts'

const OPEN_QUEUE = { ...paramsOf({}), filters: NO_FILTERS }

function useOpenTotal(): number | undefined {
  const { data } = useFindings(ALL_ENVS, OPEN_QUEUE)
  return data?.pages[0]?.total
}

export function InvestigationsHomeTile() {
  const open = useOpenTotal()
  return (
    <HomeToolTile
      to="/investigations"
      label="Investigations"
      icon={Siren}
      accent={TOOL_ACCENTS.investigations.text}
      description="What the DevOps agent found when an alarm fired, for a person to review."
      reading={open === undefined ? 'Loading' : `${open} open`}
    />
  )
}

export function InvestigationsAttention() {
  const open = useOpenTotal()
  return (
    <AttentionTile
      eyebrow="Investigations"
      to="/investigations"
      line={open === undefined ? 'Loading' : `${open} open`}
      qualifier="waiting for a review"
    />
  )
}
