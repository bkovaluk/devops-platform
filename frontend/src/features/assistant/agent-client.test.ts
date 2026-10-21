import { contentToText } from '@ag-ui/client'
import { waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { afterEach, describe, expect, it } from 'vite-plus/test'
import { useAuthStore } from '@/features/auth/auth-store'
import { useViewAsStore } from '@/features/auth/view-as'
import { db } from '@/test/msw/db'
import { server } from '@/test/msw/node'
import { setMockPrincipal } from '@/test/msw/principal'
import { answerProposal, sendMessage } from './assistant-runtime'
import { useAssistantStore } from './assistant-store'

interface SentRun {
  headers: Headers
  body: {
    threadId: string
    runId: string
    messages: { id: string; role: string; toolCalls?: unknown[] }[]
    resume?: unknown[]
  }
}

/** Every run the client sends, as the API receives it. */
function recordRuns(): SentRun[] {
  const runs: SentRun[] = []
  server.events.on('request:start', ({ request }) => {
    if (request.method !== 'POST' || !request.url.endsWith('/api/agent')) return
    void request
      .clone()
      .json()
      .then((body: SentRun['body']) => runs.push({ headers: request.headers, body }))
  })
  return runs
}

async function settled() {
  await waitFor(() => expect(useAssistantStore.getState().running).toBe(false))
  return useAssistantStore.getState()
}

function toolResults(): string[] {
  return useAssistantStore
    .getState()
    .messages.flatMap((message) =>
      message.role === 'tool' ? [contentToText(message.content)] : [],
    )
}

function sse(events: readonly Record<string, unknown>[]) {
  const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('')
  return new HttpResponse(body, { headers: { 'Content-Type': 'text/event-stream' } })
}

afterEach(() => server.events.removeAllListeners())

describe('the agent client', () => {
  it('streams a read: the call, its result and the answer', async () => {
    setMockPrincipal('viewer')
    sendMessage('Which flags are rolling out in staging?')
    const state = await settled()

    expect(state.error).toBeNull()
    const [user, call, result, answer] = state.messages
    expect(user).toMatchObject({ role: 'user', content: 'Which flags are rolling out in staging?' })
    expect(call).toMatchObject({
      role: 'assistant',
      toolCalls: [{ function: { name: 'list_flags', arguments: '{"env":"staging"}' } }],
    })
    expect(result).toMatchObject({ role: 'tool' })
    expect(JSON.parse(toolResults()[0] ?? '')).toHaveLength(
      db.flags.filter((flag) => flag.env === 'staging').length,
    )
    expect(answer).toMatchObject({ role: 'assistant' })
    expect(answer?.role === 'assistant' && answer.content).toContain('checkout-v2 at 50%')
    expect(state.proposals).toEqual([])
  })

  it('sends the credential and the lens with every run', async () => {
    const runs = recordRuns()
    useAuthStore.setState({ token: 'token-for-ada' })
    useViewAsStore.getState().setViewAs('alan@example.com')
    sendMessage('Which flags are in dev?')
    await settled()

    expect(runs).toHaveLength(1)
    expect(runs[0]?.headers.get('Authorization')).toBe('Bearer token-for-ada')
    expect(runs[0]?.headers.get('X-View-As')).toBe('alan@example.com')
  })

  it('ends a write with an interrupt and holds the change as a proposal', async () => {
    setMockPrincipal('editor')
    const pending = db.approvals.length
    sendMessage('Set checkout-v2 to 75% in staging')
    const state = await settled()

    expect(state.proposals).toHaveLength(1)
    const [proposal] = state.proposals
    expect(proposal).toMatchObject({
      decision: 'pending',
      answered: false,
      change: { action: 'update_flag', tool: 'flags', verb: 'update', env: 'staging' },
    })
    expect(proposal?.change.target).toBe('checkout-v2')
    expect(proposal?.change.before).toMatchObject({ rollout_percent: 50 })
    expect(proposal?.change.after).toMatchObject({ rollout_percent: 75 })
    expect(proposal?.interruptId).toBe(`int-${proposal?.toolCallId}`)
    expect(toolResults()).toEqual([])
    expect(db.approvals).toHaveLength(pending)
  })

  it('confirms by resuming the thread with the call and an approved answer', async () => {
    setMockPrincipal('editor')
    const runs = recordRuns()
    sendMessage('Set checkout-v2 to 75% in staging')
    const { proposals, threadId } = await settled()
    const [proposal] = proposals

    answerProposal(proposal!.interruptId, 'confirmed')
    const state = await settled()

    expect(runs).toHaveLength(2)
    const [first, resumed] = runs.map((run) => run.body)
    expect(resumed?.threadId).toBe(threadId)
    expect(resumed?.runId).not.toBe(first?.runId)
    expect(resumed?.resume).toEqual([
      { interruptId: proposal!.interruptId, status: 'resolved', payload: { approved: true } },
    ])
    const assistant = resumed?.messages.find((message) => message.role === 'assistant')
    expect(assistant?.toolCalls).toEqual([
      {
        id: proposal!.toolCallId,
        type: 'function',
        function: {
          name: 'update_flag',
          arguments: JSON.stringify({
            env: 'staging',
            key: 'checkout-v2',
            changes: { rollout_percent: 75 },
          }),
        },
      },
    ])

    const [result] = toolResults()
    expect(JSON.parse(result ?? '')).toMatchObject({
      applied: false,
      approval: { env: 'staging', target: 'checkout-v2', status: 'pending' },
    })
    expect(state.proposals[0]).toMatchObject({ decision: 'confirmed', answered: true })
    expect(db.approvals[0]).toMatchObject({
      target: 'checkout-v2',
      env: 'staging',
      payload: { rollout_percent: 75 },
      requested_by: 'lin@example.com',
    })
  })

  it('applies a confirmed change in a direct env', async () => {
    setMockPrincipal('editor')
    sendMessage('Set checkout-v2 to 40% in dev')
    const [proposal] = (await settled()).proposals
    answerProposal(proposal!.interruptId, 'confirmed')
    await settled()

    expect(JSON.parse(toolResults()[0] ?? '')).toMatchObject({ applied: true })
    expect(db.flags.find((f) => f.key === 'checkout-v2' && f.env === 'dev')).toMatchObject({
      rollout_percent: 40,
    })
  })

  it('cancels by answering cancelled, and nothing changes', async () => {
    setMockPrincipal('editor')
    const runs = recordRuns()
    const approvals = db.approvals.length
    sendMessage('Set checkout-v2 to 75% in staging')
    const [proposal] = (await settled()).proposals
    answerProposal(proposal!.interruptId, 'cancelled')
    await settled()

    expect(runs[1]?.body.resume).toEqual([
      { interruptId: proposal!.interruptId, status: 'cancelled' },
    ])
    expect(toolResults()).toEqual(['Cancelled by user.'])
    expect(db.approvals).toHaveLength(approvals)
    expect(db.flags.find((f) => f.key === 'checkout-v2' && f.env === 'staging')).toMatchObject({
      rollout_percent: 50,
    })
  })

  it('waits for every proposal of a run before it resumes', async () => {
    const runs = recordRuns()
    useAssistantStore.setState({
      proposals: ['a', 'b'].map((id) => ({
        interruptId: `int-${id}`,
        toolCallId: id,
        decision: 'pending' as const,
        answered: false,
        change: {
          action: 'update_flag',
          tool: 'flags',
          verb: 'update' as const,
          env: 'dev',
          target: id,
          before: null,
          after: null,
        },
      })),
    })
    answerProposal('int-a', 'confirmed')
    expect(useAssistantStore.getState().running).toBe(false)
    answerProposal('int-b', 'cancelled')
    await settled()

    expect(runs[0]?.body.resume).toEqual([
      { interruptId: 'int-a', status: 'resolved', payload: { approved: true } },
      { interruptId: 'int-b', status: 'cancelled' },
    ])
  })

  it('reports a refused run in the API’s words', async () => {
    server.use(
      http.post('*/api/agent', () =>
        HttpResponse.json({ detail: 'Assistant is not configured' }, { status: 503 }),
      ),
    )
    sendMessage('Hello')
    expect((await settled()).error).toBe('Assistant is not configured')
  })

  it('reports a run the agent ended with an error', async () => {
    server.use(
      http.post('*/api/agent', () =>
        sse([
          { type: 'RUN_STARTED', threadId: 't', runId: 'r' },
          { type: 'RUN_ERROR', message: 'The model is unavailable.' },
        ]),
      ),
    )
    sendMessage('Hello')
    expect((await settled()).error).toBe('The model is unavailable.')
  })
})
