import type { CSSProperties, ReactNode } from 'react'
import { layout } from '../styles/layout'
import { brand } from '../styles/brand'

type Tone = 'neutral' | 'success' | 'warning'

interface BadgeProps {
  children: ReactNode
  style?: CSSProperties
  tone?: Tone
}

const TONE_STYLE: Record<Tone, CSSProperties> = {
  neutral: {},
  success: {
    background: brand.successSoft,
    borderColor: brand.green100,
    color: brand.success,
  },
  warning: {
    background: brand.warningSoft,
    borderColor: brand.warningBorder,
    color: brand.warning,
  },
}

export function Badge({ children, style, tone = 'neutral' }: Readonly<BadgeProps>) {
  return <span style={{ ...layout.countBadge, ...TONE_STYLE[tone], ...style }}>{children}</span>
}
