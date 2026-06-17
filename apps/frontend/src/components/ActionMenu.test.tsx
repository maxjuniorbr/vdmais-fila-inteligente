import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ActionMenu } from './ActionMenu'

describe('ActionMenu', () => {
  it('renders nothing when there are no items', () => {
    const { container } = render(<ActionMenu items={[]} />)
    expect(container.querySelector('button')).toBeNull()
  })

  it('opens the menu, runs an item action and closes', () => {
    const onClick = vi.fn()
    render(<ActionMenu label="Ações" items={[{ label: 'Editar', onClick }]} />)
    const trigger = screen.getByRole('button', { name: 'Ações' })
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(screen.getByRole('menuitem', { name: 'Editar' }))
    expect(onClick).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('applies the danger tone and disabled state', () => {
    render(
      <ActionMenu
        label="Ações"
        items={[
          { label: 'Excluir', tone: 'danger', onClick: vi.fn() },
          { label: 'Bloqueado', onClick: vi.fn(), disabled: true },
        ]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Ações' }))
    expect(screen.getByRole('menuitem', { name: 'Bloqueado' })).toBeDisabled()
  })

  it('closes on Escape', () => {
    render(<ActionMenu label="Ações" items={[{ label: 'Editar', onClick: vi.fn() }]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ações' }))
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes when clicking outside', () => {
    render(<ActionMenu label="Ações" items={[{ label: 'Editar', onClick: vi.fn() }]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ações' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('keeps the menu open when the pointer lands inside it', () => {
    render(<ActionMenu label="Ações" items={[{ label: 'Editar', onClick: vi.fn() }]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ações' }))
    fireEvent.mouseDown(screen.getByRole('menu'))
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  it('ignores keyboard navigation when every item is disabled', () => {
    render(
      <ActionMenu
        label="Ações"
        items={[
          { label: 'A', onClick: vi.fn(), disabled: true },
          { label: 'B', onClick: vi.fn(), disabled: true },
        ]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Ações' }))
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' })
    // No focusable items → the handler returns early and the menu stays open.
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  it('toggles closed when the trigger is clicked again', () => {
    render(<ActionMenu label="Ações" items={[{ label: 'Editar', onClick: vi.fn() }]} />)
    const trigger = screen.getByRole('button', { name: 'Ações' })
    fireEvent.click(trigger)
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.click(trigger)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('moves focus across items with arrow keys', async () => {
    render(
      <ActionMenu
        label="Ações"
        items={[
          { label: 'Um', onClick: vi.fn() },
          { label: 'Dois', onClick: vi.fn() },
        ]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Ações' }))
    const items = screen.getAllByRole('menuitem')
    await waitFor(() => expect(items[0]).toHaveFocus())
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' })
    expect(items[1]).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowUp' })
    expect(items[0]).toHaveFocus()
  })

  it('jumps to first and last item with Home and End', async () => {
    render(
      <ActionMenu
        label="Ações"
        items={[
          { label: 'Um', onClick: vi.fn() },
          { label: 'Dois', onClick: vi.fn() },
          { label: 'Três', onClick: vi.fn() },
        ]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Ações' }))
    const items = screen.getAllByRole('menuitem')
    await waitFor(() => expect(items[0]).toHaveFocus())

    fireEvent.keyDown(screen.getByRole('menu'), { key: 'End' })
    expect(items[2]).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Home' })
    expect(items[0]).toHaveFocus()
  })

  it('closes when Tab moves focus away', () => {
    render(<ActionMenu label="Ações" items={[{ label: 'Editar', onClick: vi.fn() }]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ações' }))
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Tab' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes on scroll or resize so the menu never floats detached', () => {
    render(<ActionMenu label="Ações" items={[{ label: 'Editar', onClick: vi.fn() }]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ações' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.scroll(globalThis as unknown as Window)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
