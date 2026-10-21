import { queryOptions, useQuery } from '@tanstack/react-query'
import { useScopes } from '@/features/auth/use-scopes'
import { apiFetch } from '@/lib/api-client'
import type { AgentStatus } from '@/types/api'

/** Whether this deployment runs an assistant. The same answer for everyone. */
export const agentStatusQuery = queryOptions({
  queryKey: ['agent', 'status'],
  queryFn: () => apiFetch<AgentStatus>('/api/agent/status'),
  staleTime: Number.POSITIVE_INFINITY,
})

/**
 * Whether the assistant is offered here: the deployment runs one and the
 * principal holds a grant for it to act through. It has no rights of its own,
 * so a principal with none has nothing to ask it.
 */
export function useAssistantAvailable(): boolean {
  const { status, scopes } = useScopes()
  const granted = status === 'ready' && scopes.length > 0
  const { data } = useQuery({ ...agentStatusQuery, enabled: granted })
  return granted && data?.enabled === true
}
