import type { Meta, StoryObj } from '@storybook/react-vite'
import { Copy, GitPullRequest, Save, Trash2 } from 'lucide-react'
import { Button } from './button'
import { IconButton } from './icon-button'

const meta = {
  title: 'Controls/Button',
  component: Button,
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

/** One ink primary per task, soft secondaries, and the consequence tier. */
export const Tiers: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button>
        <Save aria-hidden="true" className="h-4 w-4" />
        Save to dev
      </Button>
      <Button variant="soft">Secondary</Button>
      <Button variant="glass-amber">
        <GitPullRequest aria-hidden="true" className="h-4 w-4" />
        Request approval for staging
      </Button>
      <Button variant="glass-rose">
        <Trash2 aria-hidden="true" className="h-4 w-4" />
        Delete from dev
      </Button>
      <Button variant="danger" size="sm">
        Delete flag
      </Button>
      <Button variant="ghost" size="sm">
        Cancel
      </Button>
    </div>
  ),
}

/** Two working heights, and the inline exception. */
export const Heights: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Button variant="soft" size="xs">
        28
      </Button>
      <Button variant="soft" size="sm">
        32
      </Button>
      <Button variant="soft">40</Button>
      <IconButton label="Copy link" icon={<Copy aria-hidden="true" className="h-3.5 w-3.5" />} />
    </div>
  ),
}

/** A disabled control keeps its reason reachable. */
export const DisabledWithReason: Story = {
  args: { disabled: true, hint: 'Editing needs flags:write in prod', children: 'Edit' },
}
