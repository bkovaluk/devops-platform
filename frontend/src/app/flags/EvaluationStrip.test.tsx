import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vite-plus/test'
import { renderApp } from '@/test/render'

async function strip() {
  return screen.findByRole('group', { name: /Evaluations of checkout-v2 in staging/ })
}

describe('the minute popover', () => {
  it('opens a minute against its column and takes focus', async () => {
    const { user } = renderApp('/flags/staging/checkout-v2')
    const columns = within(await strip()).getAllByRole('button')
    await user.click(columns[37]!)
    const popover = screen.getByRole('dialog', { name: /^checkout-v2 at \d\d:\d\d UTC$/ })
    expect(popover).toHaveFocus()
    expect(within(popover).getByText('Evaluations')).toBeInTheDocument()
    expect(columns[37]).toHaveAttribute('aria-pressed', 'true')
  })

  it('closes on Escape and hands the keyboard back to the strip', async () => {
    const { user } = renderApp('/flags/staging/checkout-v2')
    const group = await strip()
    await user.click(within(group).getAllByRole('button')[37]!)
    expect(screen.getByRole('dialog', { name: /checkout-v2 at/ })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: /checkout-v2 at/ })).not.toBeInTheDocument()
    expect(group).toContainElement(document.activeElement as HTMLElement)
  })

  it('closes when the open column is pressed again, or something outside is', async () => {
    const { user } = renderApp('/flags/staging/checkout-v2')
    const columns = within(await strip()).getAllByRole('button')
    await user.click(columns[37]!)
    await user.click(columns[37]!)
    expect(screen.queryByRole('dialog', { name: /checkout-v2 at/ })).not.toBeInTheDocument()

    await user.click(columns[12]!)
    expect(screen.getByRole('dialog', { name: /checkout-v2 at/ })).toBeInTheDocument()
    await user.click(document.body)
    expect(screen.queryByRole('dialog', { name: /checkout-v2 at/ })).not.toBeInTheDocument()
  })
})
