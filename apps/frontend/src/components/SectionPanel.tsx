import type { CSSProperties, ReactNode } from 'react'
import { brand } from '../styles/brand'
import { layout } from '../styles/layout'
import { Badge } from './Badge'
import { StatusDot } from './StatusDot'

interface SectionPanelProps {
  label: string
  dotColor?: string
  count?: number
  children: ReactNode
  style?: CSSProperties
}

export function SectionPanel({
  label,
  dotColor = brand.borderMuted,
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
    marginBottom: brand.spacing[16],
  },
}
