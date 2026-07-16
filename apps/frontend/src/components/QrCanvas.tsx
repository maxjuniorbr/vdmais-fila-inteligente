import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

// Rendered locally (no network): the TV keeps working offline and the image uses
// the CSP's existing data: allowance. Error correction M — the entry URL carries
// a long signed token, and higher levels densify the code and hurt scanning from
// a distance. Colors stay on the library's black-on-white default: scanner contrast
// is a machine requirement, not a palette choice. A data URL keeps the rendering
// local while allowing native <img> semantics for assistive technologies.
export function QrCanvas({
  value,
  sizePx,
  label,
}: Readonly<{ value: string; sizePx: number; label: string }>) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    let current = true
    void QRCode.toDataURL(value, {
      errorCorrectionLevel: 'M',
      width: sizePx,
      margin: 2,
    }).then((dataUrl) => {
      if (current) setSrc(dataUrl)
    })
    return () => {
      current = false
    }
  }, [value, sizePx])

  return src ? <img src={src} width={sizePx} height={sizePx} alt={label} /> : null
}
