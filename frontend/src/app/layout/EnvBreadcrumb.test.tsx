import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vite-plus/test'
import { grantsOf } from '@/features/auth/permissions'
import { TOOL_REGISTRY } from '@/features/tools/tool-registry'
import { renderApp } from '@/test/render'
import { pickForKey, pickRefusal, picksOf } from './env-pick'

function edge(): Element | null {
  return document.querySelector('[data-env]')
}

describe('the environment breadcrumb', () => {
  it('names the env of a list and picks another, in the URL', async () => {
    const { user, router } = renderApp('/flags')
    const crumb = await screen.findByRole('button', { name: 'Environment: All envs' })
    expect(edge()).toHaveAttribute('data-env', 'none')
    await user.click(crumb)
    await user.click(screen.getByRole('menuitemradio', { name: 'Staging' }))
    await waitFor(() => expect(router.state.location.search).toMatchObject({ env: 'staging' }))
    expect(await screen.findByRole('button', { name: 'Environment: Staging' })).toBeInTheDocument()
    expect(edge()).toHaveAttribute('data-env', 'staging')
  })

  it('opens the same flag in the env picked, since every env holds one', async () => {
    const { user, router } = renderApp('/flags/staging/checkout-v2')
    await user.click(await screen.findByRole('button', { name: 'Environment: Staging' }))
    await user.click(screen.getByRole('menuitemradio', { name: /^Prod/ }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/flags/prod/checkout-v2'))
  })

  it('returns from an investigation to the list in the env picked', async () => {
    const { user, router } = renderApp('/investigations/prod/f-checkout-0001?status=open')
    await user.click(await screen.findByRole('button', { name: 'Environment: Prod · Live' }))
    await user.click(screen.getByRole('menuitemradio', { name: 'Staging' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/investigations'))
    expect(router.state.location.search).toMatchObject({ env: 'staging' })
  })

  it('leaves the env alone when the same one is picked again', async () => {
    const { user, router } = renderApp('/investigations?env=prod')
    await user.click(await screen.findByRole('button', { name: 'Environment: Prod · Live' }))
    await user.click(screen.getByRole('menuitemradio', { name: /^Prod/ }))
    expect(router.state.location.search).toMatchObject({ env: 'prod' })
  })

  it('says a tool is tied to no env, and offers no pick', async () => {
    renderApp('/approvals')
    expect(await screen.findByRole('button', { name: 'Environment: none' })).toBeUnavailable()
    expect(edge()).toHaveAttribute('data-env', 'none')
  })

  it('picks with Option and a digit, the digit its place in the menu', async () => {
    const { user, router } = renderApp('/flags')
    await screen.findByRole('button', { name: 'Environment: All envs' })
    await user.keyboard('{Alt>}2{/Alt}')
    await waitFor(() => expect(router.state.location.search).toMatchObject({ env: 'staging' }))
    await user.keyboard('{Alt>}0{/Alt}')
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty('env', 'staging'))
  })

  it('names approval only where the open tool files approvals', async () => {
    renderApp('/investigations?env=prod')
    await screen.findByRole('list', { name: 'Investigations' })
    expect(screen.queryByText(/writes require approval/)).not.toBeInTheDocument()
  })
})

describe('what a pick means to a tool', () => {
  const narrowed = grantsOf(['findings:read:prod', 'flags:read'])

  it('greys an env the principal cannot read there, with the reason', () => {
    const tool = TOOL_REGISTRY.investigations
    expect(pickRefusal(tool, 'staging', narrowed)).toBe("You can't read investigations in staging")
    expect(pickRefusal(tool, 'prod', narrowed)).toBeNull()
    expect(pickRefusal(tool, 'all', narrowed)).toBeNull()
    expect(pickRefusal(TOOL_REGISTRY.flags, 'staging', narrowed)).toBeNull()
  })

  it('greys every pick for a tool tied to no env', () => {
    expect(pickRefusal(TOOL_REGISTRY.home, 'prod', narrowed)).toBe("Home isn't tied to an env")
  })

  it('reads the digit off the physical key', () => {
    const picks = picksOf(['dev', 'staging', 'prod'])
    expect(pickForKey('Digit0', picks)).toBe('all')
    expect(pickForKey('Digit3', picks)).toBe('prod')
    expect(pickForKey('Digit9', picks)).toBeNull()
    expect(pickForKey('KeyA', picks)).toBeNull()
  })
})
