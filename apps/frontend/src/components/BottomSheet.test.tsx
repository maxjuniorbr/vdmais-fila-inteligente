import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BottomSheet } from './BottomSheet'

describe('BottomSheet', () => {
  it('renders the title and content as a modal dialog', () => {
    render(
      <BottomSheet title="Opções" onClose={vi.fn()}>
        <button>Compartilhar</button>
      </BottomSheet>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Opções' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByText('Opções')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Compartilhar' })).toBeInTheDocument()
  })

  it('closes on backdrop click and on Escape', () => {
    const onClose = vi.fn()
    render(
      <BottomSheet title="Opções" onClose={onClose}>
        conteúdo
      </BottomSheet>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('ignores keys other than Escape', () => {
    const onClose = vi.fn()
    render(
      <BottomSheet title="Opções" onClose={onClose}>
        conteúdo
      </BottomSheet>,
    )
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(onClose).not.toHaveBeenCalled()
  })
})
