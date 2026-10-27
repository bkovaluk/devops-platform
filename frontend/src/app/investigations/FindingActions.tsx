/**
 * What the finding asks a person to do. The agent names each action by its
 * kind (a change to make, a code fix, an approval to give, or a read it was
 * denied) with what to run where there is a command. A finding written before
 * the agent named its actions carries plain suggestion lines instead.
 *
 * A command is a block to copy, headed by the env it runs in and whether it
 * destroys something. The agent never runs one; a person does.
 */
import { Chip, type ChipTone } from '@/components/ui/chip'
import { CopyButton } from '@/components/ui/copy-button'
import { EnvSignal } from '@/components/ui/env-signal'
import { Panel } from '@/components/ui/panel'
import { SECTION_HEAD_GAP, SectionHeader } from '@/components/ui/section-header'
import { isDestructive } from '@/features/findings/findings-words'
import type { ActionKind, FindingAction, FindingDetail } from '@/types/api'
import { FindingProse } from './FindingProse'

const KIND: Readonly<Record<ActionKind, { word: string; tone: ChipTone; soft: boolean }>> = {
  change: { word: 'Change', tone: 'warn', soft: true },
  code: { word: 'Code', tone: 'info', soft: true },
  read: { word: 'Read', tone: 'neutral', soft: false },
  approval: { word: 'Approval', tone: 'neutral', soft: false },
}

function Command({ command, env, number }: { command: string; env: string; number: number }) {
  return (
    <Panel tone="well" pad="none" className="mt-2 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-shell-separator py-1 pr-1 pl-3">
        <EnvSignal env={env} />
        {isDestructive(command) && (
          <Chip tone="bad" soft hint="The command reads as one that destroys something">
            Destructive
          </Chip>
        )}
        <span className="ml-auto">
          <CopyButton value={command} label={`Copy the command of action ${number}`} size="xs" />
        </span>
      </div>
      <code className="block px-3 py-2.5 font-mono text-xs leading-5 break-all whitespace-pre-wrap text-foreground">
        {command}
      </code>
    </Panel>
  )
}

function Action({ action, env, number }: { action: FindingAction; env: string; number: number }) {
  const kind = KIND[action.kind]
  return (
    <li data-kind={action.kind} className="flex items-start gap-3">
      <span className="pt-0.5 font-mono text-xs tabular-nums text-dim-foreground">{number}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span>
          <Chip tone={kind.tone} soft={kind.soft}>
            {kind.word}
          </Chip>
        </span>
        <FindingProse text={action.text} className="text-foreground" />
        {action.detail && (
          <FindingProse text={action.detail} className="text-xs leading-5 text-muted-foreground" />
        )}
        {action.command && <Command command={action.command} env={env} number={number} />}
      </div>
    </li>
  )
}

export function FindingActions({ finding }: { finding: FindingDetail }) {
  const actions = finding.actions
  const lines = actions.length > 0 ? [] : finding.suggested_actions
  if (actions.length === 0 && lines.length === 0) return null
  return (
    <section aria-labelledby="finding-actions">
      <SectionHeader
        layout="page"
        id="finding-actions"
        title="Next steps"
        description="What only a person can do. Nothing here has been run."
        className={SECTION_HEAD_GAP}
      />
      <ol aria-label="Next steps" className="flex flex-col gap-4">
        {actions.map((action, index) => (
          <Action key={index} action={action} env={finding.env} number={index + 1} />
        ))}
        {lines.map((line, index) => (
          <li key={index} className="flex items-baseline gap-3 text-sm leading-6 text-foreground">
            <span className="font-mono text-xs tabular-nums text-dim-foreground">{index + 1}</span>
            <span className="max-w-[72ch]">{line}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
