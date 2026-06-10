import type { CSSProperties, ReactNode } from 'react'
import { brand } from '../styles/brand'

type Tone = 'error' | 'warning' | 'success' | 'info'

interface AlertProps {
  tone?: Tone
  children: ReactNode
  style?: CSSProperties
}

const TONE_STYLE: Record<Tone, CSSProperties> = {
  error: {
    color: brand.danger,
    background: brand.dangerSoft,
    border: `1px solid ${brand.dangerBorder}`,
  },
  warning: {
    color: brand.warning,
    background: brand.warningSoft,
    border: `1px solid ${brand.warningBorder}`,
  },
  success: {
    color: brand.success,
    background: brand.successSoft,
    border: `1px solid ${brand.green100}`,
  },
  info: {
    color: brand.inkSoft,
    background: brand.green50,
    border: `1px solid ${brand.border}`,
  },
}

/**
 * Inline feedback message. Errors are announced assertively (role="alert");
 * other tones render as a polite live region via <output>.
 */
export function Alert({ tone = 'error', children, style }: Readonly<AlertProps>) {
  const mergedStyle = { ...base, ...TONE_STYLE[tone], ...style }
  if (tone === 'error') {
    return (
      <div role="alert" style={mergedStyle}>
        {children}
      </div>
    )
  }
  return <output style={{ ...mergedStyle, display: 'block' }}>{children}</output>
}

const base: CSSProperties = {
  padding: '0.75rem 0.9rem',
  borderRadius: 10,
  marginBottom: '1rem',
  fontWeight: 500,
  fontSize: '0.92rem',
  lineHeight: 1.45,
}
