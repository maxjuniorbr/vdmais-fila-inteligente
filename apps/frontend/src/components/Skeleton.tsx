import type { CSSProperties } from 'react'
import { brand } from '../styles/brand'

interface SkeletonProps {
  width?: number | string
  height?: number | string
  radius?: keyof typeof brand.radius
  style?: CSSProperties
}

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
