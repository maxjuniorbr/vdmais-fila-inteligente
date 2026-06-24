import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Drawer } from './Drawer'

describe('Drawer', () => {
  it('renders a labelled navigation with its content', () => {
    render(
      <Drawer title="Menu" onClose={vi.fn()}>
        <a href="#inicio">Início</a>
      </Drawer>,
    )
    expect(screen.getByRole('navigation', { name: 'Menu' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Início' })).toBeInTheDocument()
  })

  it('closes via the close button, backdrop and Escape', () => {
    const onClose = vi.fn()
    render(
      <Drawer title="Menu" onClose={onClose}>
        conteúdo
      </Drawer>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Fechar menu' }))
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('gives the close button a 44px touch target (a11y)', () => {
    render(
      <Drawer title="Menu" onClose={vi.fn()}>
        conteúdo
      </Drawer>,
    )
    const close = screen.getByRole('button', { name: 'Fechar menu' })
    expect(close.style.width).toBe('44px')
    expect(close.style.height).toBe('44px')
  })

  it('ignores keys other than Escape', () => {
    const onClose = vi.fn()
    render(
      <Drawer title="Menu" onClose={onClose}>
        conteúdo
      </Drawer>,
    )
    fireEvent.keyDown(document, { key: 'ArrowDown' })
    expect(onClose).not.toHaveBeenCalled()
  })
})
