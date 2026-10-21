/**
 * The transport to `POST /api/agent`: the official AG-UI client over
 * Server-Sent Events.
 *
 * Every request leaves with the credential and the view-as lens of the moment
 * it is sent, like every other API call, and a refusal (401, 403, 503) fails
 * the run with the API's own sentence.
 */
import { HttpAgent, type Message } from '@ag-ui/client'
import { apiUrl, ensureOk, withIdentity } from '@/lib/api-client'

export const AGENT_PATH = '/api/agent'

async function agentFetch(url: string, init: RequestInit): Promise<Response> {
  return ensureOk(await fetch(url, { ...init, headers: withIdentity(init.headers) }))
}

/** An agent for one thread, holding the messages so far. */
export function createAgent(threadId: string, messages: readonly Message[]): HttpAgent {
  return new HttpAgent({
    url: apiUrl(AGENT_PATH),
    threadId,
    initialMessages: [...messages],
    fetch: agentFetch,
  })
}
