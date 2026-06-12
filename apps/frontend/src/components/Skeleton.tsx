import type { CSSProperties } from 'react'
import { brand } from '../styles/brand'

interface SkeletonProps {
  /** Largura CSS (ex.: '100%', 200). Padrão: 100%. */
  width?: number | string
  /** Altura CSS (ex.: 16, '1rem'). Padrão: 16px. */
  height?: number | string
  /** Raio do contorno. Padrão: medium. */
  radius?: keyof typeof brand.radius
  style?: CSSProperties
}

/**
 * Placeholder de carregamento previsível (H1 — visibilidade de status).
 * A animação respeita prefers-reduced-motion via theme.css.
 */
export function Skeleton({
  width = '100%',
  height = 16,
  radius = 'medium',
  style,
}: Readonly<SkeletonProps>) {
  return (
    <span
      aria-hidden="true"
      className="gb-skeleton"
      style={{
        display: 'block',
        width,
        height,
        borderRadius: brand.radius[radius],
        ...style,
      }}
    />
  )
}
