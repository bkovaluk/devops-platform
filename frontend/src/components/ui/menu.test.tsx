import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'
import { renderUi } from '@/test/render'
import { Menu, MenuItem, MenuSeparator } from './menu'

function renderMenu(onSelect = vi.fn()) {
  const view = renderUi(
    <Menu
      trigger={
        <button type="button" aria-label="Account">
          A
        </button>
      }
    >
      <MenuItem onSelect={() => onSelect('view')}>View as…</MenuItem>
      <MenuSeparator />
      <MenuItem onSelect={() => onSelect('sign-out')}>Sign out</MenuItem>
    </Menu>,
  )
  return { ...view, onSelect, trigger: screen.getByRole('button', { name: 'Account' }) }
}

describe('Menu', () => {
  it('stays out of view and out of the tree until opened', () => {
    const { trigger } = renderMenu()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
  })

  it('opens from the keyboard on the first item and walks with the arrows', async () => {
    const { user, trigger } = renderMenu()
    trigger.focus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menu', { name: 'Account' })).toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('menuitem', { name: 'View as…' })).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toHaveFocus()
    await user.keyboard('{Home}')
    expect(screen.getByRole('menuitem', { name: 'View as…' })).toHaveFocus()
    await user.keyboard('s')
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toHaveFocus()
  })

  it('closes on Escape and hands focus back to the trigger', async () => {
    const { user, trigger } = renderMenu()
    trigger.focus()
    await user.keyboard('{ArrowUp}')
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('closes on a press outside', async () => {
    const { user, trigger } = renderMenu()
    await user.click(trigger)
    expect(screen.getByRole('menu')).toBeInTheDocument()
    await user.click(document.body)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes, then acts, when an item is chosen', async () => {
    const { user, trigger, onSelect } = renderMenu()
    await user.click(trigger)
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }))
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('sign-out')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('keeps a disabled item in the menu, reachable and inert', async () => {
    const onSelect = vi.fn()
    const { user } = renderUi(
      <Menu
        trigger={
          <button type="button" aria-label="Environment">
            E
          </button>
        }
      >
        <MenuItem checked={false} disabled onSelect={() => onSelect('prod')}>
          Prod
        </MenuItem>
      </Menu>,
    )
    await user.click(screen.getByRole('button', { name: 'Environment' }))
    const item = screen.getByRole('menuitemradio', { name: 'Prod' })
    expect(item).toHaveAttribute('aria-disabled', 'true')
    await user.click(item)
    expect(onSelect).not.toHaveBeenCalled()
    expect(screen.getByRole('menu', { name: 'Environment' })).toBeInTheDocument()
  })
})
