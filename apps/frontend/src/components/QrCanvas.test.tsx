import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import QRCode from 'qrcode'
import { QrCanvas } from './QrCanvas'

vi.mock('qrcode', () => ({ default: { toCanvas: vi.fn().mockResolvedValue(undefined) } }))

describe('QrCanvas', () => {
  it('draws the value locally on an accessible canvas', async () => {
    render(
      <QrCanvas value="https://app.local/fila/er-1#entry=tok" sizePx={240} label="QR de entrada" />,
    )

    const canvas = screen.getByRole('img', { name: 'QR de entrada' })
    await waitFor(() => {
      expect(vi.mocked(QRCode.toCanvas)).toHaveBeenCalledWith(
        canvas,
        'https://app.local/fila/er-1#entry=tok',
        expect.objectContaining({ errorCorrectionLevel: 'M', width: 240 }),
      )
    })
  })

  it('redraws when the value changes (token rotation)', async () => {
    const { rerender } = render(<QrCanvas value="https://a" sizePx={200} label="QR" />)
    rerender(<QrCanvas value="https://b" sizePx={200} label="QR" />)

    await waitFor(() => {
      expect(vi.mocked(QRCode.toCanvas)).toHaveBeenLastCalledWith(
        expect.anything(),
        'https://b',
        expect.objectContaining({ width: 200 }),
      )
    })
  })
})
