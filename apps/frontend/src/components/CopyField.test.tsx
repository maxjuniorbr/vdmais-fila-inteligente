import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CopyField } from './CopyField'

const ORIGINAL_CLIPBOARD = navigator.clipboard

afterEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    value: ORIGINAL_CLIPBOARD,
    configurable: true,
  })
})

function stubClipboard(writeText: () => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  })
  Object.defineProperty(globalThis, 'isSecureContext', { value: true, configurable: true })
}

describe('CopyField', () => {
  it('renders a clickable link that opens in a new tab', () => {
    render(<CopyField label="Painel" value="https://exemplo.com/painel" openLabel="Abrir painel" />)
    const link = screen.getByRole('link', { name: /Abrir painel/ })
    expect(link).toHaveAttribute('href', 'https://exemplo.com/painel')
    expect(link).toHaveAttribute('target', '_blank')
    expect(screen.getByText('Painel')).toBeInTheDocument()
  })

  it('copies the value and shows confirmation feedback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubClipboard(writeText)
    render(<CopyField label="Link" value="https://exemplo.com" />)

    fireEvent.click(screen.getByRole('button', { name: 'Copiar Link' }))

    await waitFor(() =>
      expect(screen.getByText('Endereço copiado para a área de transferência.')).toBeInTheDocument(),
    )
    expect(writeText).toHaveBeenCalledWith('https://exemplo.com')
  })

  it('shows an error message when copying fails', async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error('blocked')))
    // Force the textarea fallback path to also fail.
    const execCommand = vi.fn().mockReturnValue(false)
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true })

    render(<CopyField label="Link" value="https://exemplo.com" />)
    fireEvent.click(screen.getByRole('button', { name: 'Copiar Link' }))

    await waitFor(() =>
      expect(screen.getByText('Não foi possível copiar. Use o link ao lado.')).toBeInTheDocument(),
    )
  })
})
