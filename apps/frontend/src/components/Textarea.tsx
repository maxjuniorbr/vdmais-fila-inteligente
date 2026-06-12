import type { CSSProperties, TextareaHTMLAttributes } from 'react'
import { layout } from '../styles/layout'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  containerStyle?: CSSProperties
}

/** Entrada de texto longo, com rótulo sempre visível. */
export function Textarea({
  label,
  containerStyle,
  style,
  className,
  rows = 3,
  ...rest
}: Readonly<TextareaProps>) {
  const cls = ['gb-control', className].filter(Boolean).join(' ')
  const field = (
    <textarea
      className={cls}
      rows={rows}
      style={{ ...layout.formInput, minHeight: 80, resize: 'vertical', ...style }}
      {...rest}
    />
  )
  if (label) {
    return (
      <label style={{ ...layout.formLabel, ...containerStyle }}>
        {label}
        {field}
      </label>
    )
  }
  return field
}
