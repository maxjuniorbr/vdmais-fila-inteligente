import type { ButtonHTMLAttributes, CSSProperties } from 'react'
import { layout } from '../styles/layout'
import { brand } from '../styles/brand'

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
  sm: { padding: `${brand.spacing[8]}px ${brand.spacing[16]}px`, minHeight: 36, fontSize: brand.typography.bodySmall.fontSize, borderRadius: brand.radius.medium },
}

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
