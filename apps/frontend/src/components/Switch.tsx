import type { InputHTMLAttributes } from 'react'
import { brand } from '../styles/brand'

interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string
}

export function Switch({ label, className, ...rest }: Readonly<SwitchProps>) {
  const cls = ['gb-switch', className].filter(Boolean).join(' ')
  return (
    <label className="gb-choice gb-choice--block">
      <span style={{ fontSize: brand.typography.bodyLarge.fontSize, color: brand.ink }}>
        {label}
      </span>
      <input type="checkbox" role="switch" className={cls} {...rest} />
    </label>
  )
}
