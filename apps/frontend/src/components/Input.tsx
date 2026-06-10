import type { CSSProperties, InputHTMLAttributes } from 'react'
import { layout } from '../styles/layout'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Optional label displayed above the input */
  label?: string
  /** Optional style for the label/container around a labeled input */
  containerStyle?: CSSProperties
}

/**
 * Design-system text input. Matches the standard padding, border-radius and
 * border color used across all staff screens.
 */
export function Input({ label, containerStyle, style, className, ...rest }: Readonly<InputProps>) {
  const cls = ['gb-control', className].filter(Boolean).join(' ')
  if (label) {
    return (
      <label style={{ ...layout.formLabel, ...containerStyle }}>
        {label}
        <input className={cls} style={{ ...layout.formInput, ...style }} {...rest} />
      </label>
    )
  }
  return <input className={cls} style={{ ...layout.formInput, ...style }} {...rest} />
}
