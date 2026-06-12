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
    border: `1px solid ${brand.successBorder}`,
  },
  info: {
    color: brand.info,
    background: brand.infoSoft,
    border: `1px solid ${brand.infoBorder}`,
  },
}

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
  padding: `${brand.spacing[12]}px`,
  borderRadius: brand.radius.medium,
  marginBottom: `${brand.spacing[16]}px`,
  fontWeight: 500,
  fontSize: brand.typography.bodySmall.fontSize,
  lineHeight: 1.45,
}
