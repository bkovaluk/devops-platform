import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vite-plus/test'
import { renderApp } from '@/test/render'

function list() {
  return screen.getByRole('list', { name: 'Investigations' })
}

/** Each row's path: a row also carries the list's own keys, so it opens beside the same list. */
async function rows() {
  await screen.findByRole('list', { name: 'Investigations' })
  return within(list())
    .getAllByRole('link')
    .map((link) => link.getAttribute('href')?.split('?')[0])
}

describe('the investigations list', () => {
  it('lists the open findings of every env, newest first, each with its env', async () => {
    renderApp('/investigations')
    expect(await rows()).toEqual([
      '/investigations/prod/f-checkout-0001',
      '/investigations/dev/f-reports-0001',
      '/investigations/prod/f-orders-0001',
      '/investigations/staging/f-payments-0001',
      '/investigations/staging/f-billing-0001',
    ])
    expect(within(list()).getAllByText('prod').length).toBeGreaterThan(0)
    expect(within(list()).getByText('Incomplete')).toBeInTheDocument()
  })

  it('narrows to the env the URL names', async () => {
    renderApp('/investigations?env=staging')
    expect(await rows()).toEqual([
      '/investigations/staging/f-payments-0001',
      '/investigations/staging/f-billing-0001',
    ])
  })

  it('keeps the tab in the URL', async () => {
    const { user, router } = renderApp('/investigations')
    await screen.findByRole('list', { name: 'Investigations' })
    await user.click(screen.getByRole('radio', { name: /Acknowledged/ }))
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({ status: 'acknowledged' }),
    )
    await waitFor(async () => expect(await rows()).toEqual(['/investigations/prod/f-search-0001']))
  })

  it('searches on Enter, not on every keystroke', async () => {
    const { user, router } = renderApp('/investigations')
    await screen.findByRole('list', { name: 'Investigations' })
    await user.type(screen.getByRole('searchbox', { name: 'Search investigations' }), 'orders')
    expect(router.state.location.search).not.toHaveProperty('q')
    await user.keyboard('{Enter}')
    await waitFor(() => expect(router.state.location.search).toMatchObject({ q: 'orders' }))
    await waitFor(async () => expect(await rows()).toEqual(['/investigations/prod/f-orders-0001']))
  })

  it('narrows by a facet, with the counts of the window beside each value', async () => {
    const { user, router } = renderApp('/investigations')
    await screen.findByRole('list', { name: 'Investigations' })
    await user.click(screen.getByRole('button', { name: 'Severity' }))
    await user.click(screen.getByRole('menuitemradio', { name: /^high/ }))
    await waitFor(() => expect(router.state.location.search).toMatchObject({ severity: ['high'] }))
    await waitFor(async () =>
      expect(await rows()).toEqual([
        '/investigations/prod/f-checkout-0001',
        '/investigations/staging/f-payments-0001',
      ]),
    )
    await user.click(screen.getByRole('button', { name: 'Clear severity' }))
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty('severity'))
  })

  it('lets triage rows in only when asked', async () => {
    const { user } = renderApp('/investigations?env=prod')
    expect(await rows()).not.toContain('/investigations/prod/f-notify-0001')
    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('menuitemradio', { name: 'Triage rows' }))
    await waitFor(async () => expect(await rows()).toContain('/investigations/prod/f-notify-0001'))
  })

  it('walks the list with j and k', async () => {
    const { user, router } = renderApp('/investigations')
    await screen.findByRole('list', { name: 'Investigations' })
    await user.keyboard('j')
    await screen.findByRole('heading', { name: /version 214 deploy/ })
    await user.keyboard('j')
    await screen.findByRole('heading', { name: /dataset doubled/ })
    expect(router.state.location.pathname).toBe('/investigations/dev/f-reports-0001')
    await user.keyboard('k')
    await screen.findByRole('heading', { name: /version 214 deploy/ })
    expect(router.state.location.pathname).toBe('/investigations/prod/f-checkout-0001')
  })

  it('stays closed to a principal without the read', async () => {
    renderApp('/investigations', { as: 'empty' })
    expect(await screen.findByText('Not part of your access')).toBeInTheDocument()
  })
})

describe('one investigation', () => {
  it('reads as cause, verification, next steps, hypotheses and the notebook', async () => {
    renderApp('/investigations/prod/f-checkout-0001')
    expect(
      await screen.findByRole('heading', {
        name: 'checkout-api errors started with the version 214 deploy',
      }),
    ).toBeInTheDocument()
    const hypotheses = screen.getByRole('list', { name: 'Hypotheses' })
    expect(within(hypotheses).getAllByRole('listitem')).toHaveLength(3)
    const verified = screen.getByRole('list', { name: 'Verified' })
    expect(within(verified).getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByRole('list', { name: 'Next steps' })).toHaveTextContent(
      'Point the live alias back to version 213',
    )
    const notebook = screen.getByRole('list', { name: 'Notebook' })
    expect(within(notebook).getByRole('listitem', { name: 'Step 1' })).toHaveTextContent(
      'aws.cloudwatch.get_metric_data',
    )
    expect(within(notebook).getByRole('listitem', { name: 'Step 5' })).toHaveTextContent('lookup')
    expect(within(notebook).getByRole('listitem', { name: 'Run ended' })).toHaveTextContent(
      'Chose to stop',
    )
  })

  it('dims the steps a hypothesis in focus does not cite', async () => {
    const { user } = renderApp('/investigations/prod/f-checkout-0001')
    const hypotheses = await screen.findByRole('list', { name: 'Hypotheses' })
    await user.click(within(hypotheses).getAllByRole('button', { pressed: false })[0]!)
    const notebook = screen.getByRole('list', { name: 'Notebook' })
    expect(within(notebook).getByRole('listitem', { name: 'Step 2' })).not.toHaveAttribute(
      'data-dimmed',
    )
    expect(within(notebook).getByRole('listitem', { name: 'Step 4' })).toHaveAttribute(
      'data-dimmed',
      'true',
    )
  })

  it('marks a refused call as blocked', async () => {
    renderApp('/investigations/prod/f-orders-0001')
    const notebook = await screen.findByRole('list', { name: 'Notebook' })
    expect(within(notebook).getByRole('listitem', { name: 'Step 4' })).toHaveTextContent('Blocked')
  })

  it('acknowledges an open finding', async () => {
    const { user } = renderApp('/investigations/prod/f-checkout-0001', { as: 'editor' })
    await user.click(await screen.findByRole('button', { name: /Acknowledge/ }))
    expect(await screen.findByText(/Acknowledged by lin@example.com/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Acknowledge/ })).not.toBeInTheDocument()
  })

  it('closes a reported cause as confirmed at one press', async () => {
    const { user } = renderApp('/investigations/prod/f-orders-0001', { as: 'editor' })
    await user.click(await screen.findByRole('button', { name: /Confirmed/ }))
    const decision = await screen.findByRole('region', { name: 'Decision' })
    await waitFor(() => expect(decision).toHaveTextContent('Confirmed by lin@example.com'))
  })

  it('asks what was wrong before closing as wrong', async () => {
    const { user, router } = renderApp('/investigations/prod/f-checkout-0001', { as: 'editor' })
    await user.click(await screen.findByRole('button', { name: /^Wrong/ }))
    await waitFor(() => expect(router.state.location.search).toMatchObject({ close: 'wrong' }))
    const dialog = await screen.findByRole('dialog', { name: 'Close investigation' })
    const submit = within(dialog).getByRole('button', { name: 'Close as Wrong' })
    expect(submit).toBeUnavailable()
    await user.type(within(dialog).getByLabelText(/Note/), 'The cache, not the deploy.')
    expect(submit).toBeActionable()
    await user.click(submit)
    const decision = await screen.findByRole('region', { name: 'Decision' })
    await waitFor(() => expect(decision).toHaveTextContent('Wrong by lin@example.com'))
    expect(decision).toHaveTextContent('The cache, not the deploy.')
  })

  it('offers only a dismissal when the agent reported no cause', async () => {
    renderApp('/investigations/staging/f-billing-0001', { as: 'editor' })
    expect(await screen.findByRole('button', { name: /Dismiss/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Confirmed/ })).not.toBeInTheDocument()
  })

  it('shows a reader without the review scope the state and nothing to press', async () => {
    renderApp('/investigations/prod/f-checkout-0001', { as: 'reviewer' })
    expect(await screen.findByText('Reviewing needs findings:review in prod.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Acknowledge/ })).not.toBeInTheDocument()
  })

  it('says when an investigation is gone', async () => {
    renderApp('/investigations/prod/f-nope')
    expect(await screen.findByText('No investigation f-nope in prod')).toBeInTheDocument()
  })

  it('opens the findings before it on the same resource', async () => {
    const { user } = renderApp('/investigations/prod/f-checkout-0001')
    await user.click(await screen.findByRole('button', { name: '1 run' }))
    const history = await screen.findByRole('list', { name: 'History' })
    expect(within(history).getByRole('link')).toHaveAttribute(
      'href',
      '/investigations/prod/f-checkout-0000',
    )
  })
})
