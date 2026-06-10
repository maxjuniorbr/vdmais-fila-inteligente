import type { CSSProperties, ReactNode } from 'react'
import { layout } from '../styles/layout'
import { Badge } from './Badge'
import { StatusDot } from './StatusDot'

interface SectionPanelProps {
  /** Uppercase section label */
  label: string
  /** Dot color for the leading status indicator */
  dotColor?: string
  /** Optional count badge shown on the right side of the header */
  count?: number
  /** Panel content */
  children: ReactNode
  /** Override panel style */
  style?: CSSProperties
}

/**
 * Reusable panel with a standardized header: status dot + uppercase label + optional badge.
 * Used across Operação and Gestão for queue status sections.
 */
export function SectionPanel({
  label,
  dotColor = '#94a3b8',
  count,
  children,
  style,
}: Readonly<SectionPanelProps>) {
  return (
    <section style={{ ...layout.panel, ...style }}>
      <div style={styles.head}>
        <p style={{ ...layout.sectionLabel, margin: 0 }}>
          <StatusDot color={dotColor} />
          {label}
        </p>
        {count !== undefined && <Badge>{count}</Badge>}
      </div>
      {children}
    </section>
  )
}

const styles: Record<string, CSSProperties> = {
  head: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '0.9rem',
  },
}
