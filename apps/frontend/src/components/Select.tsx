import type { SelectHTMLAttributes } from 'react'
import { layout } from '../styles/layout'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
}

export function Select({ label, style, className, children, ...rest }: Readonly<SelectProps>) {
  const selectStyle = { ...layout.formInput, ...style }
  const cls = ['gb-control', className].filter(Boolean).join(' ')

  if (label) {
    return (
      <label style={layout.formLabel}>
        {label}
        <select className={cls} style={selectStyle} {...rest}>
          {children}
        </select>
      </label>
    )
  }
  return (
    <select className={cls} style={selectStyle} {...rest}>
      {children}
    </select>
  )
}
