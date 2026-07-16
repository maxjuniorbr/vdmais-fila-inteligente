import type { CSSProperties, InputHTMLAttributes } from 'react'
import { forwardRef } from 'react'
import { layout } from '../styles/layout'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  containerStyle?: CSSProperties
}

export const Input = forwardRef<HTMLInputElement, Readonly<InputProps>>(function Input(
  { label, containerStyle, style, className, ...rest },
  ref,
) {
  const cls = ['gb-control', className].filter(Boolean).join(' ')
  if (label) {
    return (
      <label style={{ ...layout.formLabel, ...containerStyle }}>
        {label}
        <input ref={ref} className={cls} style={{ ...layout.formInput, ...style }} {...rest} />
      </label>
    )
  }
  return <input ref={ref} className={cls} style={{ ...layout.formInput, ...style }} {...rest} />
})
