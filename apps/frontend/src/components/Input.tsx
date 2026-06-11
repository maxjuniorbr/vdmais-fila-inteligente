import type { CSSProperties, InputHTMLAttributes } from 'react'
import { layout } from '../styles/layout'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  containerStyle?: CSSProperties
}

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
