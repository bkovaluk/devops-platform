import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'
import { renderUi } from '@/test/render'
import { Button } from './button'

describe('Hint', () => {
  it('opens on keyboard focus and describes its control', async () => {
    const { user } = renderUi(<Button hint="Editing needs flags:write">Edit</Button>)
    await user.tab()
    const button = screen.getByRole('button', { name: 'Edit' })
    expect(button).toHaveFocus()
    expect(screen.getByRole('tooltip')).toHaveTextContent('Editing needs flags:write')
    expect(button).toHaveAccessibleDescription('Editing needs flags:write')
  })

  it('stays shut for a press, which is not a reader arriving', async () => {
    const { user } = renderUi(<Button hint="Editing needs flags:write">Edit</Button>)
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('puts itself away on Escape before anything under it hears the key', async () => {
    const onKeyDown = vi.fn()
    const { user } = renderUi(
      <div role="presentation" onKeyDown={(event) => onKeyDown(event.key)}>
        <Button hint="Editing needs flags:write">Edit</Button>
      </div>,
    )
    await user.tab()
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    expect(onKeyDown).not.toHaveBeenCalled()
    await user.keyboard('{Escape}')
    expect(onKeyDown).toHaveBeenCalledWith('Escape')
  })

  it('keeps a disabled control with a reason reachable from the keyboard', async () => {
    const { user } = renderUi(
      <Button disabled hint="Editing needs flags:write">
        Edit
      </Button>,
    )
    await user.tab()
    expect(screen.getByRole('button', { name: 'Edit' })).toHaveFocus()
    expect(screen.getByRole('tooltip')).toHaveTextContent('Editing needs flags:write')
  })
})
