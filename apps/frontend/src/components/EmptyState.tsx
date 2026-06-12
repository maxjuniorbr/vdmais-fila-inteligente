import type { CSSProperties, ReactNode } from 'react'
import { brand } from '../styles/brand'

interface EmptyStateProps {
  title: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
  style?: CSSProperties
}

export function EmptyState({ title, description, icon, action, style }: Readonly<EmptyStateProps>) {
  return (
    <div style={{ ...styles.wrap, ...style }}>
      {icon && <span style={styles.iconCircle}>{icon}</span>}
      <h3 style={styles.title}>{title}</h3>
      {description && <p style={styles.description}>{description}</p>}
      {action && <div style={styles.action}>{action}</div>}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    gap: `${brand.spacing[8]}px`,
    padding: `${brand.spacing[32]}px`,
    background: brand.surface,
    border: `1px solid ${brand.border}`,
    borderRadius: brand.radius.medium,
  },
  iconCircle: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 64,
    height: 64,
    marginBottom: `${brand.spacing[8]}px`,
    borderRadius: '50%',
    background: brand.canvasWarm,
    color: brand.inkMuted,
  },
  title: {
    margin: 0,
    fontSize: brand.typography.subtitle.fontSize,
    fontWeight: 600,
    color: brand.ink,
  },
  description: {
    margin: 0,
    maxWidth: 400,
    fontSize: brand.typography.bodyLarge.fontSize,
    color: brand.inkMuted,
    lineHeight: 1.5,
  },
  action: {
    marginTop: `${brand.spacing[16]}px`,
  },
}
