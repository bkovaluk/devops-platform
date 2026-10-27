import type { Meta, StoryObj } from '@storybook/react-vite'
import { seedFindings } from '@/test/msw/findings'
import type { FindingDetail } from '@/types/api'
import { FindingDecision } from './FindingDecision'

const FINDINGS = seedFindings(Date.now())

function fixture(id: string): FindingDetail {
  const found = FINDINGS.find((item) => item.finding_id === id)
  if (!found) throw new Error(`no fixture ${id}`)
  return found
}

const meta = {
  title: 'Investigations/Decision',
  component: FindingDecision,
  args: {
    canReview: true,
    busy: false,
    onAcknowledge: () => {},
    onResolve: () => {},
    onReview: () => {},
    className: 'max-w-3xl px-gutter-pane',
  },
} satisfies Meta<typeof FindingDecision>

export default meta
type Story = StoryObj<typeof meta>

/** A reported cause, open: acknowledge, or grade how the agent did. */
export const ReportedOpen: Story = { args: { finding: fixture('f-checkout-0001') } }

/** Nothing reported, so nothing to grade: acknowledge or dismiss. */
export const NothingToGrade: Story = { args: { finding: fixture('f-billing-0001') } }

/** Somebody is looking at it already. */
export const Acknowledged: Story = { args: { finding: fixture('f-search-0001') } }

/** Closed: how, by whom and why. */
export const Closed: Story = { args: { finding: fixture('f-resizer-0001') } }

/** A reader without the review scope sees the state and nothing to press. */
export const ReadOnly: Story = { args: { finding: fixture('f-checkout-0001'), canReview: false } }
