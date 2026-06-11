import { brand } from '../styles/brand'
import { layout } from '../styles/layout'

interface StatusDotProps {
  color?: string
  size?: number
}

export function StatusDot({ color = brand.borderMuted, size }: Readonly<StatusDotProps>) {
  const style = {
    ...layout.dot,
    background: color,
    ...(size ? { width: size, height: size } : null),
  }
  return <span style={style} />
}
