import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'
import { useViewAsStore } from '@/features/auth/view-as'
import { renderUi } from '@/test/render'
import { Button } from './button'
import { IconButton } from './icon-button'

describe('Button', () => {
  it('acts when nothing refuses it', async () => {
    const onClick = vi.fn()
    const { user } = renderUi(
      <Button mutates onClick={onClick}>
        Save
      </Button>,
    )
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onClick).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Save' })).toBeActionable()
  })

  it('refuses a change while viewing as someone, by pointer and by keyboard', async () => {
    useViewAsStore.getState().setViewAs('alan@example.com')
    const onClick = vi.fn()
    const { user } = renderUi(
      <Button mutates onClick={onClick}>
        Save
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Save' })
    expect(button).toBeUnavailable()
    await user.click(button)
    button.focus()
    await user.keyboard('{Enter}')
    expect(onClick).not.toHaveBeenCalled()
  })

  it('reads a consequence variant as a change without being told', async () => {
    useViewAsStore.getState().setViewAs('alan@example.com')
    const onClick = vi.fn()
    const { user } = renderUi(
      <Button variant="glass-rose" onClick={onClick}>
        Delete
      </Button>,
    )
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('leaves a control that changes nothing alone under a lens', async () => {
    useViewAsStore.getState().setViewAs('alan@example.com')
    const onClick = vi.fn()
    const { user } = renderUi(
      <Button variant="soft" onClick={onClick}>
        Open
      </Button>,
    )
    await user.click(screen.getByRole('button', { name: 'Open' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('keeps a disabled control with a reason reachable, and refuses the press', async () => {
    const onClick = vi.fn()
    const { user } = renderUi(
      <Button disabled hint="Editing needs flags:write" onClick={onClick}>
        Edit
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Edit' })
    expect(button).not.toBeDisabled()
    expect(button).toBeUnavailable()
    await user.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('names an icon alone by its label', () => {
    renderUi(<IconButton label="Copy link" icon={<span aria-hidden="true">c</span>} />)
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument()
  })
})
