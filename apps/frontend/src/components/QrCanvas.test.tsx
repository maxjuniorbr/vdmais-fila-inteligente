import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import QRCode from 'qrcode'
import { QrCanvas } from './QrCanvas'

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn(async (value: string) => `data:image/png;base64,${value}`) },
}))

describe('QrCanvas', () => {
  it('generates the value locally as a semantic image', async () => {
    render(
      <QrCanvas value="https://app.local/fila/er-1#entry=tok" sizePx={240} label="QR de entrada" />,
    )

    const image = await screen.findByRole('img', { name: 'QR de entrada' })
    await waitFor(() => {
      expect(vi.mocked(QRCode.toDataURL)).toHaveBeenCalledWith(
        'https://app.local/fila/er-1#entry=tok',
        expect.objectContaining({ errorCorrectionLevel: 'M', width: 240 }),
      )
    })
    expect(image).toHaveAttribute('width', '240')
    expect(image).toHaveAttribute('height', '240')
  })

  it('redraws when the value changes (token rotation)', async () => {
    const { rerender } = render(<QrCanvas value="https://a" sizePx={200} label="QR" />)
    rerender(<QrCanvas value="https://b" sizePx={200} label="QR" />)

    await waitFor(() => {
      expect(vi.mocked(QRCode.toDataURL)).toHaveBeenLastCalledWith(
        'https://b',
        expect.objectContaining({ width: 200 }),
      )
    })
  })
})
