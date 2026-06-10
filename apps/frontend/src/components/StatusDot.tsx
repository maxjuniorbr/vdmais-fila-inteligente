import { layout } from '../styles/layout'

interface StatusDotProps {
  /** Dot color — any valid CSS color value */
  color?: string
  /** Size override in px (default: 8) */
  size?: number
}

/**
 * Small colored circle used as a visual status indicator next to labels.
 */
export function StatusDot({ color = '#94a3b8', size }: Readonly<StatusDotProps>) {
  const style = {
    ...layout.dot,
    background: color,
    ...(size ? { width: size, height: size } : null),
  }
  return <span style={style} />
}
