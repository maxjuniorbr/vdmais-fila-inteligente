import type { ButtonHTMLAttributes, CSSProperties } from 'react'
import { layout } from '../styles/layout'

type Variant = 'primary' | 'secondary' | 'danger'
type Size = 'md' | 'sm'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

const VARIANT_STYLE: Record<Variant, CSSProperties> = {
  primary: layout.primaryButton,
  secondary: layout.ghostButton,
  danger: layout.dangerButton,
}

const SIZE_STYLE: Record<Size, CSSProperties> = {
  md: {},
  sm: { padding: '0.45rem 0.9rem', minHeight: 36, fontSize: '0.85rem', borderRadius: 8 },
}

/**
 * Shared design-system button. Variants: primary (filled), secondary (outline),
 * danger (destructive outline). Use across all staff screens for consistency.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  style,
  disabled,
  className,
  ...rest
}: Readonly<ButtonProps>) {
  return (
    <button
      className={['gb-button', className].filter(Boolean).join(' ')}
      style={{
        ...VARIANT_STYLE[variant],
        ...SIZE_STYLE[size],
        ...(disabled ? { opacity: 0.55, cursor: 'not-allowed' } : null),
        ...style,
      }}
      disabled={disabled}
      {...rest}
    />
  )
}
