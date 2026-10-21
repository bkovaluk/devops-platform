/**
 * The conversation in this tab: its thread, its messages as AG-UI holds them,
 * and the changes the assistant has proposed.
 *
 * A thread belongs to one tab (`sessionStorage`) and to one identity. It was
 * read as somebody, so signing in as someone else or starting or leaving a
 * view-as ends it, like the private caches.
 */
import type { Message } from '@ag-ui/client'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { useAuthStore } from '@/features/auth/auth-store'
import { useViewAsStore } from '@/features/auth/view-as'
import type { Proposal } from './proposal'

export interface AssistantState {
  threadId: string
  messages: Message[]
  proposals: Proposal[]
  /** Why the last run stopped short, in the API's or the agent's words. */
  error: string | null
  running: boolean
}

export function freshThread(): AssistantState {
  return {
    threadId: crypto.randomUUID(),
    messages: [],
    proposals: [],
    error: null,
    running: false,
  }
}

export const useAssistantStore = create<AssistantState>()(
  persist(freshThread, {
    name: 'platform-assistant',
    storage: createJSONStorage(() => sessionStorage),
    partialize: (state) => ({
      threadId: state.threadId,
      messages: state.messages,
      proposals: state.proposals,
    }),
  }),
)

/** Start over: a new thread with nothing in it. */
export function resetThread(): void {
  useAssistantStore.setState(freshThread())
}

/** A proposal still waiting for the person to confirm or cancel it. */
export function useAwaitingDecision(): boolean {
  return useAssistantStore((state) => state.proposals.some((p) => p.decision === 'pending'))
}

useAuthStore.subscribe((state, previous) => {
  if (state.generation !== previous.generation) resetThread()
})

useViewAsStore.subscribe((state, previous) => {
  if (state.viewAs !== previous.viewAs) resetThread()
})
