import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vite-plus/test'
import { renderApp } from '@/test/render'

function flagList() {
  return screen.getByRole('list', { name: 'Flags' })
}

describe('the flags list', () => {
  it('reads every environment, read-only, when the scope is all', async () => {
    renderApp('/flags')
    await screen.findByRole('list', { name: 'Flags' })
    expect(within(flagList()).getAllByText('checkout-v2')).toHaveLength(3)
    expect(screen.getByText(/All envs · read-only/)).toBeInTheDocument()
  })

  it('narrows to the environment the URL names', async () => {
    renderApp('/flags?env=prod')
    await screen.findByRole('list', { name: 'Flags' })
    expect(within(flagList()).getAllByText('checkout-v2')).toHaveLength(1)
    expect(screen.getByText(/Prod · Live/, { selector: 'p' })).toBeInTheDocument()
  })

  it('keeps the search and the state filter in the URL', async () => {
    const { user, router } = renderApp('/flags')
    await screen.findByRole('list', { name: 'Flags' })

    await user.type(screen.getByRole('searchbox', { name: 'Search flags' }), 'dark')
    await waitFor(() => expect(router.state.location.search).toMatchObject({ q: 'dark' }))
    await waitFor(() => expect(within(flagList()).queryAllByText('checkout-v2')).toHaveLength(0))
    expect(within(flagList()).getAllByText('dark-mode-default')).toHaveLength(3)

    await user.clear(screen.getByRole('searchbox', { name: 'Search flags' }))
    await user.click(screen.getByRole('radio', { name: /^Off/ }))
    await waitFor(() => expect(router.state.location.search).toMatchObject({ state: 'off' }))
    expect(within(flagList()).getAllByText('eu-data-residency')).toHaveLength(3)
    expect(within(flagList()).queryAllByText('rate-limit-v2')).toHaveLength(0)
  })

  it('says when nothing matches', async () => {
    renderApp('/flags?q=nothing-like-this')
    expect(await screen.findByText('No flags match')).toBeInTheDocument()
  })

  it('offers a new flag only to a principal who can write one', async () => {
    renderApp('/flags', { as: 'viewer' })
    await screen.findByRole('list', { name: 'Flags' })
    expect(screen.queryByRole('button', { name: /New flag/ })).not.toBeInTheDocument()
  })

  it('opens a flag in the detail column', async () => {
    const { user, router } = renderApp('/flags?env=staging')
    await screen.findByRole('list', { name: 'Flags' })
    await user.click(within(flagList()).getByText('checkout-v2'))
    await waitFor(() => expect(router.state.location.pathname).toBe('/flags/staging/checkout-v2'))
    expect(await screen.findByRole('heading', { name: 'checkout-v2' })).toBeInTheDocument()
    expect(
      await screen.findByRole('group', { name: /Evaluations of checkout-v2 in staging/ }),
    ).toBeInTheDocument()
  })
})
