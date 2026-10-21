/**
 * Running the conversation: send a message, answer a proposal, stop. One
 * agent per thread, created from the stored messages, so a reload picks the
 * thread up where it was.
 *
 * A write never happens in the run that proposes it. The run ends with an
 * interrupt per change; once every one of them is confirmed or cancelled, a
 * new run on the same thread answers them all, and the agent applies the
 * confirmed ones through the normal path: at once in a direct env, as an
 * approval request anywhere else.
 */
import {
  type AgentSubscriber,
  contentToText,
  type HttpAgent,
  type Message,
  type ResumeEntry,
} from '@ag-ui/client'
import { queryClient } from '@/lib/query-client'
import { createAgent } from './agent-client'
import { useAssistantStore } from './assistant-store'
import { changeAnswered } from './assistant-toast'
import { type Decision, outcomeOf, type Proposal, proposalOf } from './proposal'

let agent: HttpAgent | null = null

function agentForThread(): HttpAgent {
  const { threadId, messages } = useAssistantStore.getState()
  if (agent?.threadId !== threadId) agent = createAgent(threadId, messages)
  return agent
}

// A new thread abandons whatever the old one was doing.
useAssistantStore.subscribe((state, previous) => {
  if (state.threadId === previous.threadId || !agent) return
  agent.abortRun()
  agent = null
})

function snapshot(messages: readonly Message[]): Message[] {
  return structuredClone([...messages])
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

/** What a run reports, heard only while its agent is still the thread's. */
function subscriberFor(runner: HttpAgent): AgentSubscriber {
  const live = () => agent === runner
  return {
    onMessagesChanged: ({ messages }) => {
      if (live()) useAssistantStore.setState({ messages: snapshot(messages) })
    },
    onRunFinishedEvent: (params) => {
      if (!live() || params.outcome !== 'interrupt') return
      const proposals = params.interrupts.flatMap((interrupt) => proposalOf(interrupt) ?? [])
      useAssistantStore.setState((state) => ({ proposals: [...state.proposals, ...proposals] }))
    },
    onToolCallResultEvent: ({ event }) => {
      if (!live()) return
      const proposal = useAssistantStore
        .getState()
        .proposals.find((p) => p.toolCallId === event.toolCallId && p.decision === 'confirmed')
      if (!proposal) return
      changeAnswered(proposal.change, outcomeOf(contentToText(event.content)))
      void queryClient.invalidateQueries()
    },
    onRunErrorEvent: ({ event }) => {
      if (live()) useAssistantStore.setState({ error: event.message })
    },
  }
}

async function run(resume?: ResumeEntry[]): Promise<void> {
  const runner = agentForThread()
  useAssistantStore.setState({ running: true, error: null })
  try {
    await runner.runAgent({ runId: crypto.randomUUID(), resume }, subscriberFor(runner))
  } catch (error) {
    if (agent === runner && !isAbort(error)) useAssistantStore.setState({ error: messageOf(error) })
  } finally {
    if (agent === runner) useAssistantStore.setState({ running: false })
  }
}

export function sendMessage(text: string): void {
  const content = text.trim()
  const state = useAssistantStore.getState()
  if (!content || state.running || state.proposals.some((p) => p.decision === 'pending')) return
  const runner = agentForThread()
  runner.addMessage({ id: crypto.randomUUID(), role: 'user', content })
  useAssistantStore.setState({ messages: snapshot(runner.messages) })
  void run()
}

function resumeEntry(proposal: Proposal): ResumeEntry {
  return proposal.decision === 'confirmed'
    ? { interruptId: proposal.interruptId, status: 'resolved', payload: { approved: true } }
    : { interruptId: proposal.interruptId, status: 'cancelled' }
}

/** Confirm or cancel one proposal; the run resumes once none is left open. */
export function answerProposal(interruptId: string, decision: Exclude<Decision, 'pending'>): void {
  const state = useAssistantStore.getState()
  if (state.running) return
  const proposals = state.proposals.map((p) =>
    p.interruptId === interruptId && p.decision === 'pending' ? { ...p, decision } : p,
  )
  if (proposals.some((p) => p.decision === 'pending')) {
    useAssistantStore.setState({ proposals })
    return
  }
  const unanswered = proposals.filter((p) => !p.answered)
  useAssistantStore.setState({ proposals: proposals.map((p) => ({ ...p, answered: true })) })
  void run(unanswered.map(resumeEntry))
}

export function stopRun(): void {
  agent?.abortRun()
}
