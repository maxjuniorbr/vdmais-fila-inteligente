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
    gap: `${brand.spacing[4]}px`,
    textAlign: 'center',
    padding: `${brand.spacing[16]}px`,
    background: brand.surface,
    border: `1px solid ${brand.border}`,
    borderRadius: brand.radius.medium,
    boxShadow: brand.shadow,
  },
  value: {
    fontSize: brand.typography.heading.fontSize,
    fontWeight: 700,
    color: brand.ink,
  },
  label: {
    fontSize: brand.typography.auxiliar.fontSize,
    color: brand.inkMuted,
    letterSpacing: '0.02em',
  },
}
