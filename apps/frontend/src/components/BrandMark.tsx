import type { CSSProperties } from 'react'
import { brand } from '../styles/brand'

interface BrandMarkProps {
  onDark?: boolean
  size?: number
}

/**
 * Marca neutra do produto (VD+ Fila Inteligente) — monograma abstrato de fila.
 * Não representa nenhuma marca corporativa: três traços decrescentes que
 * remetem a uma fila/atendimento.
 */
export function BrandMark({ onDark = false, size = 30 }: Readonly<BrandMarkProps>) {
  const emblemBg = onDark ? 'rgba(255,255,255,0.16)' : brand.canvas
  const markColor = onDark ? '#ffffff' : brand.emphasis

  const emblem: CSSProperties = {
    width: size,
    height: size,
    borderRadius: brand.radius.medium,
    background: emblemBg,
    border: onDark ? 'none' : `1px solid ${brand.border}`,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  }

  return (
    <span style={styles.wrap} aria-hidden="true">
      <span style={emblem}>
        <svg
          width={size * 0.56}
          height={size * 0.56}
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle cx="6" cy="6" r="2.4" fill={markColor} />
          <circle cx="12" cy="12" r="2.4" fill={markColor} opacity="0.7" />
          <circle cx="18" cy="18" r="2.4" fill={markColor} opacity="0.4" />
        </svg>
      </span>
    </span>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    display: 'inline-flex',
    alignItems: 'center',
  },
}
