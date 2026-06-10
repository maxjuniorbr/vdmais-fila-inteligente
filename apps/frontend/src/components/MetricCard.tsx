import type { CSSProperties } from 'react'
import { brand } from '../styles/brand'

interface MetricCardProps {
  label: string
  value: string | number
}

/**
 * Single KPI card — displays a large value with a smaller label below.
 * Used in the Manager dashboard metrics grid.
 */
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
    padding: '0.9rem',
    background: brand.surface,
    border: `1px solid ${brand.border}`,
    borderTop: `3px solid ${brand.green500}`,
    borderRadius: 10,
    boxShadow: brand.shadow,
  },
  value: {
    fontSize: '1.35rem',
    fontWeight: 700,
    color: brand.green800,
  },
  label: {
    fontSize: '0.78rem',
    color: brand.inkMuted,
    letterSpacing: '0.02em',
  },
}
