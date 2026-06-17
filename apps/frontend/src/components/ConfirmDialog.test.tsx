import axe from 'axe-core'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmDialog } from './ConfirmDialog'

describe('ConfirmDialog', () => {
  it('contains focus, closes with Escape and restores the previous focus', () => {
    const opener = document.createElement('button')
    opener.textContent = 'Abrir confirmação'
    document.body.append(opener)
    opener.focus()

    const onClose = vi.fn()
    const { unmount } = render(
      <ConfirmDialog title="Cancelar senha" onConfirm={vi.fn()} onClose={onClose} />,
    )

    const dialog = screen.getByRole('dialog')
    const reason = screen.getByLabelText('Motivo obrigatório')
    const closeButton = screen.getByRole('button', { name: 'Fechar' })

    expect(dialog).toHaveAttribute('open')
    expect(reason).toHaveFocus()

    closeButton.focus()
    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(reason).toHaveFocus()

    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(closeButton).toHaveFocus()

    reason.setAttribute('disabled', '')
    closeButton.setAttribute('disabled', '')
    expect(fireEvent.keyDown(dialog, { key: 'Tab' })).toBe(false)

    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    expect(onClose).toHaveBeenCalledOnce()

    unmount()
    expect(opener).toHaveFocus()
    opener.remove()
  })

  it('lets Tab fall through when focus is not on a boundary element', () => {
    render(<ConfirmDialog title="Cancelar senha" onConfirm={vi.fn()} onClose={vi.fn()} />)
    const dialog = screen.getByRole('dialog')
    const reason = screen.getByLabelText('Motivo obrigatório')

    reason.focus()
    // The textarea is neither the first nor the last focusable, so the trap does
    // not preventDefault — the event stays uncancelled (fireEvent returns true).
    expect(fireEvent.keyDown(dialog, { key: 'Tab' })).toBe(true)
  })

  it('has no detectable axe violations', async () => {
    render(<ConfirmDialog title="Restaurar senha" onConfirm={vi.fn()} onClose={vi.fn()} />)

    const results = await axe.run(screen.getByRole('dialog'), {
      rules: { 'color-contrast': { enabled: false } },
    })

    expect(results.violations).toEqual([])
  })
})
