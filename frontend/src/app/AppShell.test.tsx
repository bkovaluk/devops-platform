import { screen, waitFor, within } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vite-plus/test'
import { useViewAsStore } from '@/features/auth/view-as'
import { server } from '@/test/msw/node'
import { renderApp } from '@/test/render'

describe('the shell', () => {
  it('rails the tools a principal can open, in order', async () => {
    renderApp('/', { as: 'viewer' })
    const nav = await screen.findByRole('navigation', { name: 'Tools' })
    await waitFor(() =>
      expect(
        within(nav)
          .getAllByRole('link')
          // A rail row ends in its count once the count has loaded.
          .map((link) => link.textContent?.replace(/\d+$/, '')),
      ).toEqual(['Home', 'Approvals', 'Feature flags', 'Investigations']),
    )
  })

  it('gives a principal with no grants a page about getting some, and no rail', async () => {
    renderApp('/', { as: 'empty' })
    expect(await screen.findByText('No tools are open to you yet')).toBeInTheDocument()
    expect(
      within(screen.getByRole('navigation', { name: 'Tools' })).queryAllByRole('link'),
    ).toEqual([])
  })

  it('never mounts a tool reached by a link the principal cannot open', async () => {
    renderApp('/flags', { as: 'empty' })
    expect(await screen.findByText('Not part of your access')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Flags' })).not.toBeInTheDocument()
  })

  it('says a view-as out loud and refuses changes under it', async () => {
    useViewAsStore.getState().setViewAs('lin@example.com')
    renderApp('/flags/dev/checkout-v2')
    expect(await screen.findByText('Viewing as lin@example.com · read-only')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /Delete flag/ })).toBeUnavailable()
  })

  it('asks for a credential when the API wants one', async () => {
    server.use(
      http.get('*/auth/me', () => HttpResponse.json({ detail: 'Sign in.' }, { status: 401 })),
    )
    renderApp('/')
    expect(
      await screen.findByText('Paste the access token your deployment issued.'),
    ).toBeInTheDocument()
  })

  it('opens a tool by its digit', async () => {
    const { user, router } = renderApp('/')
    await screen.findByRole('link', { name: 'Feature flags' })
    await user.keyboard('3')
    await waitFor(() => expect(router.state.location.pathname).toBe('/flags'))
  })

  // jsdom lays nothing out, so this holds the shape that keeps a view inside
  // the workspace: one cell whose floor is zero, which no content can widen.
  it('hosts the view in a single zero-floor cell', async () => {
    renderApp('/flags/staging/checkout-v2')
    await screen.findByRole('heading', { name: 'checkout-v2' })
    expect(screen.getByRole('main').lastElementChild).toHaveClass(
      'grid',
      'grid-cols-[minmax(0,1fr)]',
      'grid-rows-[minmax(0,1fr)]',
    )
  })

  it('names approval-routed environments under the top bar', async () => {
    renderApp('/flags?env=prod')
    expect(await screen.findByText('· live · writes require approval')).toBeInTheDocument()
  })

  it('keeps the assistant dock closed until the top bar opens it', async () => {
    const { user } = renderApp('/')
    const toggle = await screen.findByRole('button', { name: 'Open assistant' })
    expect(screen.queryByRole('complementary', { name: 'Assistant' })).not.toBeInTheDocument()
    await user.click(toggle)
    expect(screen.getByRole('complementary', { name: 'Assistant' })).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'Close assistant' })[0]!)
    expect(screen.queryByRole('complementary', { name: 'Assistant' })).not.toBeInTheDocument()
  })
})
