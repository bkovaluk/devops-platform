/**
 * The conversation: the person's words on the accent fill, the assistant's as
 * reading text, each read it made as a quiet row, each change it proposes as
 * a card to confirm. It follows the newest turn while an answer streams in.
 */
import { Sparkles } from 'lucide-react'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { Message, MessageContent } from '@/components/ui/message'
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@/components/ui/message-scroller'
import { Skeleton } from '@/components/ui/skeleton'
import { useAssistantStore } from '@/features/assistant/assistant-store'
import type { Proposal } from '@/features/assistant/proposal'
import { type Turn, turnsOf } from '@/features/assistant/thread-view'
import { ProposalCard } from './ProposalCard'
import { ToolCallRow } from './ToolCallRow'

function TurnView({
  turn,
  proposals,
  running,
}: {
  turn: Turn
  proposals: readonly Proposal[]
  running: boolean
}) {
  if (turn.kind === 'user') {
    return (
      <Message align="end">
        <MessageContent>
          <Bubble variant="filled">
            <BubbleContent>{turn.text}</BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
    )
  }
  return (
    <Message>
      <MessageContent className="gap-1.5">
        {turn.parts.map((part) => {
          if (part.kind === 'text') {
            return (
              <Bubble key={part.id} variant="plain" className="py-1">
                <BubbleContent>{part.text}</BubbleContent>
              </Bubble>
            )
          }
          const proposal = proposals.find((p) => p.toolCallId === part.call.id)
          return proposal ? (
            <ProposalCard key={part.call.id} proposal={proposal} result={part.call.result} />
          ) : (
            <ToolCallRow key={part.call.id} call={part.call} running={running} />
          )
        })}
      </MessageContent>
    </Message>
  )
}

/** Whether the run has gone quiet between steps: nothing is streaming in. */
function working(turns: readonly Turn[]): boolean {
  const last = turns.at(-1)
  if (last?.kind !== 'assistant') return true
  return last.parts.at(-1)?.kind === 'call'
}

export function AssistantThread() {
  const messages = useAssistantStore((state) => state.messages)
  const proposals = useAssistantStore((state) => state.proposals)
  const running = useAssistantStore((state) => state.running)
  const error = useAssistantStore((state) => state.error)
  const turns = turnsOf(messages)

  if (turns.length === 0 && !running && !error) {
    return (
      <EmptyState
        variant="inspector"
        icon={<Sparkles />}
        title="Ask about flags and approvals"
        body="It acts as you, with your access. Nothing changes until you confirm it."
      />
    )
  }

  return (
    <MessageScrollerProvider autoScroll defaultScrollPosition="end">
      <MessageScroller>
        <MessageScrollerViewport aria-label="Conversation">
          <MessageScrollerContent className="px-gutter-pane py-4">
            {turns.map((turn) => (
              <MessageScrollerItem
                key={turn.id}
                messageId={turn.id}
                scrollAnchor={turn.kind === 'user'}
              >
                <TurnView turn={turn} proposals={proposals} running={running} />
              </MessageScrollerItem>
            ))}
            {running && working(turns) && (
              <div role="status" className="flex flex-col gap-2 py-1">
                <span className="sr-only">The assistant is working</span>
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            )}
            {error && (
              <ErrorState variant="inline" heading="The assistant stopped" detail={error} />
            )}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
    </MessageScrollerProvider>
  )
}
