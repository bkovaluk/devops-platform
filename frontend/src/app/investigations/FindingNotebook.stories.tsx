import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import {
  citationsByStep,
  contextEvidence,
  orderedHypotheses,
} from '@/features/findings/findings-reasoning'
import { seedFindings } from '@/test/msw/findings'
import type { FindingDetail } from '@/types/api'
import { FindingNotebook } from './FindingNotebook'

const FINDINGS = seedFindings(Date.now())

function fixture(id: string): FindingDetail {
  const found = FINDINGS.find((item) => item.finding_id === id)
  if (!found) throw new Error(`no fixture ${id}`)
  return found
}

function Notebook({ finding, focus = null }: { finding: FindingDetail; focus?: number | null }) {
  const [focused, setFocused] = useState<number | null>(focus)
  return (
    <div className="max-w-2xl">
      <FindingNotebook
        steps={finding.tool_trail}
        citations={citationsByStep(finding)}
        context={contextEvidence(finding)}
        hypotheses={orderedHypotheses(finding)}
        focused={focused}
        onFocus={(index) => setFocused(focused === index ? null : index)}
        highlighted={null}
        outcome={finding.outcome}
        run={finding.run}
        calls={finding.tool_call_count}
        tokens={finding.tokens_used}
      />
    </div>
  )
}

const meta = {
  title: 'Investigations/Notebook',
  component: Notebook,
} satisfies Meta<typeof Notebook>

export default meta
type Story = StoryObj<typeof meta>

/** A reported cause: every call in order, what each did to a hypothesis, a
 *  lookup, the run's ending and what came from the context. */
export const Reported: Story = { args: { finding: fixture('f-checkout-0001') } }

/** The likely hypothesis in focus: every step it does not cite dims. */
export const HypothesisInFocus: Story = { args: { finding: fixture('f-checkout-0001'), focus: 0 } }

/** A call a guard refused, and calls that came back empty. */
export const Blocked: Story = { args: { finding: fixture('f-orders-0001') } }

/** A run that hit its turn limit before it reported. */
export const Incomplete: Story = { args: { finding: fixture('f-billing-0001') } }
