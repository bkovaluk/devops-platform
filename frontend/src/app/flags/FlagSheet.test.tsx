import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vite-plus/test'
import { db } from '@/test/msw/db'
import { renderApp } from '@/test/render'

function flag(key: string, env: string) {
  return db.flags.find((f) => f.key === key && f.env === env)
}

describe('the flag sheet', () => {
  it('turns a staging edit into an approval request, and says so before submit', async () => {
    const { user } = renderApp('/flags/staging/checkout-v2?edit=true')
    const submit = await screen.findByRole('button', { name: 'Request approval for staging' })
    expect(screen.getByRole('note')).toHaveTextContent('A teammate reviews it in Approvals')

    const rollout = screen.getByRole('textbox', { name: 'Rollout percent' })
    await user.clear(rollout)
    await user.type(rollout, '75')
    await user.click(submit)

    await waitFor(() =>
      expect(db.approvals[0]).toMatchObject({
        env: 'staging',
        action: 'update',
        target: 'checkout-v2',
        payload: { rollout_percent: 75 },
        status: 'pending',
        requested_by: 'ada@example.com',
      }),
    )
    expect(
      await screen.findByText('Update of checkout-v2 requested for staging'),
    ).toBeInTheDocument()
    expect(flag('checkout-v2', 'staging')?.rollout_percent).toBe(50)
  })

  it('applies a dev edit directly', async () => {
    const { user } = renderApp('/flags/dev/checkout-v2?edit=true')
    const submit = await screen.findByRole('button', { name: 'Save to dev' })
    expect(screen.queryByRole('note')).not.toBeInTheDocument()

    await user.click(screen.getByRole('switch'))
    await user.click(submit)

    await waitFor(() => expect(flag('checkout-v2', 'dev')?.enabled).toBe(false))
    expect(await screen.findByText('checkout-v2 updated in dev')).toBeInTheDocument()
  })

  it('refuses a rollout outside 0 to 100 without asking the API', async () => {
    const { user } = renderApp('/flags/staging/checkout-v2?edit=true')
    const rollout = await screen.findByRole('textbox', { name: 'Rollout percent' })
    const before = db.approvals.length
    await user.clear(rollout)
    await user.type(rollout, '150')
    await user.click(screen.getByRole('button', { name: 'Request approval for staging' }))
    expect(await screen.findByText('A whole number from 0 to 100.')).toBeInTheDocument()
    expect(db.approvals).toHaveLength(before)
  })

  it('creates a flag in dev and opens it', async () => {
    const { user, router } = renderApp('/flags?env=dev&create=true')
    await user.type(await screen.findByRole('textbox', { name: 'Key' }), 'new-search-box')
    await user.type(screen.getByRole('textbox', { name: 'Owner' }), 'search@example.com')
    await user.click(screen.getByRole('button', { name: 'Create in dev' }))
    await waitFor(() => expect(flag('new-search-box', 'dev')).toBeDefined())
    await waitFor(() => expect(router.state.location.pathname).toBe('/flags/dev/new-search-box'))
  })
})
