import type { CSSProperties } from 'react'
import { brand } from '../styles/brand'

export interface BarItem {
  label: string
  value: number
  display?: string
  highlight?: boolean
}

interface BarListProps {
  items: BarItem[]
  emptyMessage?: string
}

export function BarList({ items, emptyMessage = 'Sem dados' }: Readonly<BarListProps>) {
  if (items.length === 0) return <p style={styles.empty}>{emptyMessage}</p>

  const max = Math.max(...items.map((item) => item.value), 1)

  return (
    <ul style={styles.list}>
      {items.map((item) => {
        const pct = Math.max(item.value > 0 ? 4 : 0, Math.round((item.value / max) * 100))
        return (
          <li
            key={item.label}
            style={styles.item}
            aria-label={`${item.label}: ${item.display ?? item.value}`}
          >
            <div style={styles.head}>
              <span style={styles.label}>{item.label}</span>
              <span style={styles.value}>{item.display ?? item.value}</span>
            </div>
            <div style={styles.track} aria-hidden="true">
              <div
                style={{
                  ...styles.fill,
                  width: `${pct}%`,
                  background: item.highlight ? brand.conversion : brand.actionable,
                }}
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

const styles: Record<string, CSSProperties> = {
  list: {
    display: 'grid',
    gap: `${brand.spacing[12]}px`,
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  item: {
    display: 'grid',
    gap: `${brand.spacing[4]}px`,
  },
  head: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: `${brand.spacing[8]}px`,
  },
  label: {
    fontSize: brand.typography.bodySmall.fontSize,
    color: brand.inkSoft,
  },
  value: {
    fontSize: brand.typography.bodySmall.fontSize,
    fontWeight: 700,
    color: brand.ink,
    fontVariantNumeric: 'tabular-nums',
  },
  track: {
    height: 8,
    borderRadius: brand.radius.pill,
    background: brand.canvas,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: brand.radius.pill,
    transition: 'width 200ms ease',
  },
  empty: {
    margin: 0,
    color: brand.inkMuted,
    fontSize: brand.typography.bodySmall.fontSize,
  },
}
