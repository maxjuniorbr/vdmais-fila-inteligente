import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Modal } from './Modal'

describe('Modal', () => {
  it('renders title, content and footer as an open dialog', () => {
    render(
      <Modal title="Confirmar ação" footer={<button>Confirmar</button>} onClose={vi.fn()}>
        Corpo do modal
      </Modal>,
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('open')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByText('Confirmar ação')).toBeInTheDocument()
    expect(screen.getByText('Corpo do modal')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeInTheDocument()
  })

  it('closes via the close button', () => {
    const onClose = vi.fn()
    render(
      <Modal title="X" onClose={onClose}>
        c
      </Modal>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('closes on backdrop click (target is the dialog itself)', () => {
    const onClose = vi.fn()
    render(
      <Modal title="X" onClose={onClose}>
        c
      </Modal>,
    )
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('closes on Escape (cancel event)', () => {
    const onClose = vi.fn()
    render(
      <Modal title="X" onClose={onClose}>
        c
      </Modal>,
    )
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
