import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vite-plus/test'
import { useViewAsStore } from '@/features/auth/view-as'
import { queryClient } from '@/lib/query-client'
import { setMockAssistant } from '@/test/msw/agent'
import { db } from '@/test/msw/db'
import { renderApp } from '@/test/render'

async function openDock(as: string) {
  const view = renderApp('/', { as })
  await view.user.click(await screen.findByRole('button', { name: 'Open assistant' }))
  const dock = screen.getByRole('complementary', { name: 'Assistant' })
  const field = await within(dock).findByRole('textbox', { name: 'Message the assistant' })
  return { ...view, dock, field }
}

async function ask(user: ReturnType<typeof renderApp>['user'], field: HTMLElement, text: string) {
  await user.type(field, `${text}{Enter}`)
}

/** The shell has heard who this is, and what the deployment says about an assistant. */
async function settledOn(...queryKey: string[]) {
  await waitFor(() =>
    expect(queryClient.getQueryCache().find({ queryKey })?.state.status).toBe('success'),
  )
}

async function proposalCard(dock: HTMLElement) {
  return within(dock).findByRole('region', { name: /Update flag\s*checkout-v2/ })
}

describe('the assistant dock', () => {
  it('is not offered when the deployment runs no assistant', async () => {
    setMockAssistant(false)
    renderApp('/', { as: 'admin' })
    await settledOn('agent', 'status')
    expect(screen.queryByRole('button', { name: 'Open assistant' })).not.toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: 'Assistant' })).not.toBeInTheDocument()
  })

  it('is not offered to a principal with no grants', async () => {
    renderApp('/', { as: 'empty' })
    expect(await screen.findByText('No tools are open to you yet')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open assistant' })).not.toBeInTheDocument()
  })

  it('streams an answer with a quiet row for each read', async () => {
    const { user, dock, field } = await openDock('viewer')
    await ask(user, field, 'Which flags are rolling out in staging?')

    expect(await within(dock).findByText(/staging has \d+ flags/)).toBeInTheDocument()
    const row = within(dock).getByRole('button', { name: 'list_flags in staging: Done' })
    await user.click(row)
    expect(row).toHaveAttribute('aria-expanded', 'true')
    expect(within(dock).getByText('Result')).toBeVisible()
  })

  it('sends on Enter and breaks the line on Shift+Enter', async () => {
    const { user, dock, field } = await openDock('viewer')
    await user.type(field, 'Which flags{Shift>}{Enter}{/Shift}are in dev?')
    expect(field).toHaveValue('Which flags\nare in dev?')
    await user.keyboard('{Enter}')
    expect(field).toHaveValue('')
    expect(await within(dock).findByText(/dev has \d+ flags/)).toBeInTheDocument()
  })

  it('shows a proposed change in staging as a request for approval', async () => {
    const { user, dock, field } = await openDock('editor')
    await ask(user, field, 'Set checkout-v2 to 75% in staging')

    const card = await proposalCard(dock)
    expect(within(card).getByText('staging')).toBeInTheDocument()
    expect(within(card).getByText('50%')).toBeInTheDocument()
    expect(within(card).getByText('75%')).toBeInTheDocument()
    expect(within(card).getByRole('note')).toHaveTextContent('A teammate reviews it in Approvals')
    expect(
      within(card).getByRole('button', { name: 'Request approval for staging' }),
    ).toBeActionable()
    expect(field).toBeDisabled()
  })

  it('files the approval on confirm and links to it', async () => {
    const { user, dock, field } = await openDock('editor')
    await ask(user, field, 'Set checkout-v2 to 75% in staging')
    const card = await proposalCard(dock)
    await user.click(within(card).getByRole('button', { name: 'Request approval for staging' }))

    expect(await within(card).findByText('Requested')).toBeInTheDocument()
    const [approval] = db.approvals
    expect(approval).toMatchObject({ target: 'checkout-v2', env: 'staging', status: 'pending' })
    expect(within(card).getByRole('link', { name: 'Open request' })).toHaveAttribute(
      'href',
      `/approvals?status=all&id=${approval?.id}`,
    )
    expect(
      await screen.findByText('Update of checkout-v2 requested for staging'),
    ).toBeInTheDocument()
    expect(await within(dock).findByText(/Filed request/)).toBeInTheDocument()
    expect(field).toBeActionable()
  })

  it('saves directly in a direct env', async () => {
    const { user, dock, field } = await openDock('editor')
    await ask(user, field, 'Set checkout-v2 to 40% in dev')
    const card = await proposalCard(dock)
    expect(within(card).queryByRole('note')).not.toBeInTheDocument()
    await user.click(within(card).getByRole('button', { name: 'Save to dev' }))

    expect(await within(card).findByText('Applied')).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'Open flag' })).toHaveAttribute(
      'href',
      '/flags/dev/checkout-v2',
    )
  })

  it('changes nothing on cancel', async () => {
    const { user, dock, field } = await openDock('editor')
    const approvals = db.approvals.length
    await ask(user, field, 'Set checkout-v2 to 75% in staging')
    const card = await proposalCard(dock)
    await user.click(within(card).getByRole('button', { name: 'Cancel' }))

    expect(await within(card).findByText('Cancelled')).toBeInTheDocument()
    expect(await within(dock).findByText('Left checkout-v2 as it was.')).toBeInTheDocument()
    expect(db.approvals).toHaveLength(approvals)
  })

  it('says it is read-only under a view-as', async () => {
    useViewAsStore.getState().setViewAs('lin@example.com')
    const { dock } = await openDock('admin')
    expect(within(dock).getByRole('note')).toHaveTextContent(
      'Viewing as lin@example.com: answers come through their access, and nothing can be changed.',
    )
  })

  it('starts a new chat', async () => {
    const { user, dock, field } = await openDock('viewer')
    await ask(user, field, 'Which flags are in dev?')
    await within(dock).findByText(/dev has \d+ flags/)
    await user.click(within(dock).getByRole('button', { name: 'New chat' }))
    expect(within(dock).getByText('Ask about flags and approvals')).toBeInTheDocument()
  })

  it('closes on Escape and hands focus back to its toggle', async () => {
    const { user, field } = await openDock('viewer')
    expect(field).toHaveFocus()
    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(screen.queryByRole('complementary', { name: 'Assistant' })).not.toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: 'Open assistant' })).toHaveFocus()
  })
})
