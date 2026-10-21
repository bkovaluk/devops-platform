import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vite-plus/test'
import { db } from '@/test/msw/db'
import { renderApp } from '@/test/render'

async function rowFor(target: string) {
  const list = await screen.findByRole('list', { name: 'Approval requests' })
  const row = within(list)
    .getAllByRole('listitem')
    .find((item) => within(item).queryByText(target))
  if (!row) throw new Error(`no row for ${target}`)
  return within(row)
}

function stored(id: string) {
  return db.approvals.find((approval) => approval.id === id)
}

describe('the approvals inbox', () => {
  it('offers Withdraw on your own request and a decision on everyone else’s', async () => {
    renderApp('/approvals')
    const own = await rowFor('beta-dashboard')
    expect(own.getByRole('button', { name: /Withdraw/ })).toBeInTheDocument()
    expect(own.queryByRole('button', { name: /Approve/ })).not.toBeInTheDocument()

    const theirs = await rowFor('checkout-v2')
    expect(theirs.getByRole('button', { name: /Approve/ })).toBeActionable()
  })

  it('applies a change in one press', async () => {
    const { user } = renderApp('/approvals')
    const row = await rowFor('checkout-v2')
    await user.click(row.getByRole('button', { name: /Approve/ }))
    await waitFor(() => expect(stored('apr_1001')?.status).toBe('approved'))
    expect(db.flags.find((f) => f.key === 'checkout-v2' && f.env === 'prod')?.rollout_percent).toBe(
      25,
    )
    expect(await screen.findByText('Approved and applied: checkout-v2 in prod')).toBeInTheDocument()
  })

  it('rejects only with a note', async () => {
    const { user } = renderApp('/approvals')
    const row = await rowFor('invoice-pdf-v2')
    await user.click(row.getByRole('button', { name: /Reject/ }))
    const submit = await screen.findByRole('button', { name: 'Reject request' })
    expect(submit).toBeUnavailable()
    await user.type(
      screen.getByRole('textbox', { name: 'Why it is rejected' }),
      'Needs a load test first.',
    )
    await user.click(submit)
    await waitFor(() =>
      expect(stored('apr_1002')).toMatchObject({
        status: 'rejected',
        review_note: 'Needs a load test first.',
      }),
    )
  })

  it('lets the requester withdraw', async () => {
    const { user } = renderApp('/approvals')
    const row = await rowFor('beta-dashboard')
    await user.click(row.getByRole('button', { name: /Withdraw/ }))
    await waitFor(() => expect(stored('apr_1003')?.status).toBe('withdrawn'))
  })

  it('keeps the decision from a principal who cannot review', async () => {
    renderApp('/approvals', { as: 'viewer' })
    const row = await rowFor('checkout-v2')
    expect(row.getByRole('button', { name: /Approve/ })).toBeUnavailable()
  })

  it('says how every finished request ended', async () => {
    renderApp('/approvals?status=all')
    await screen.findByRole('list', { name: 'Approval requests' })
    for (const word of ['Approved', 'Rejected', 'Withdrawn', 'Expired', 'Failed']) {
      expect(screen.getByText(word)).toBeInTheDocument()
    }
  })

  it('opens and marks the request a link points at', async () => {
    renderApp('/approvals?status=all&id=apr_0994')
    const row = await rowFor('legacy-cart')
    expect(row.getByText('legacy-cart no longer exists in prod.')).toBeVisible()
    expect(row.getByRole('button', { name: /legacy-cart/ })).toHaveAttribute('aria-current', 'true')
  })
})
