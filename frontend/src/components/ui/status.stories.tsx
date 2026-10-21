import type { Meta, StoryObj } from '@storybook/react-vite'
import { Chip } from './chip'
import { EnvSignal } from './env-signal'
import { StateMark } from './state-mark'

const meta = {
  title: 'Status/Marks, chips and environments',
  component: StateMark,
} satisfies Meta<typeof StateMark>

export default meta
type Story = StoryObj<typeof meta>

/** Health is a mark, a status word is a chip, an environment is a signal. */
export const OneLookEach: Story = {
  args: { tone: 'ok', word: 'On' },
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <StateMark tone="ok" word="Healthy" />
        <StateMark tone="warn" word="Degraded" />
        <StateMark tone="bad" word="Failed" />
        <StateMark tone="unknown" word="Quiet" />
      </div>
      <div className="flex items-center gap-2">
        <Chip tone="ok" soft>
          On
        </Chip>
        <Chip tone="info" soft mono>
          On · 25%
        </Chip>
        <Chip tone="neutral">Off</Chip>
        <Chip tone="warn" soft>
          Pending
        </Chip>
        <Chip tone="bad" soft hint="The flag no longer exists in prod.">
          Failed
        </Chip>
      </div>
      <div className="flex items-center gap-4">
        {['dev', 'qa', 'staging', 'prod', 'sandbox'].map((env) => (
          <EnvSignal key={env} env={env} />
        ))}
        <EnvSignal env="prod" muted />
        <EnvSignal env="staging" label={false} />
      </div>
    </div>
  ),
}
