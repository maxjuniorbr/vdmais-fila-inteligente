import type { CSSProperties } from 'react'
import { brand } from '../styles/brand'

interface MetricCardProps {
  label: string
  value: string | number
}

export function MetricCard({ label, value }: Readonly<MetricCardProps>) {
  return (
    <article style={styles.card}>
      <strong style={styles.value}>{value}</strong>
      <span style={styles.label}>{label}</span>
    </article>
  )
}

const styles: Record<string, CSSProperties> = {
  card: {
    display: 'grid',
    gap: '0.25rem',
    textAlign: 'center',
    padding: `${brand.spacing[16]}px`,
    background: brand.surface,
    border: `1px solid ${brand.border}`,
    borderTop: `3px solid ${brand.green500}`,
    borderRadius: brand.radius.medium,
    boxShadow: brand.shadow,
  },
  value: {
    fontSize: brand.typography.heading.fontSize,
    fontWeight: 700,
    color: brand.green800,
  },
  label: {
    fontSize: brand.typography.auxiliar.fontSize,
    color: brand.inkMuted,
    letterSpacing: '0.02em',
  },
}
