import { useEffect, useRef } from 'react'
import QRCode from 'qrcode'

// Rendered locally (no network): the TV keeps working offline and the CSP stays
// 'self'-only. Error correction M — the entry URL carries a long signed token,
// and higher levels densify the code and hurt scanning from a distance. Colors
// stay on the library's black-on-white default: scanner contrast is a machine
// requirement, not a palette choice.
export function QrCanvas({
  value,
  sizePx,
  label,
}: Readonly<{ value: string; sizePx: number; label: string }>) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    void QRCode.toCanvas(canvasRef.current, value, {
      errorCorrectionLevel: 'M',
      width: sizePx,
      margin: 2,
    })
  }, [value, sizePx])

  return <canvas ref={canvasRef} role="img" aria-label={label} />
}
