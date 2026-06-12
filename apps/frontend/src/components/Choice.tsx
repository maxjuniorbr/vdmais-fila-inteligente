import type { InputHTMLAttributes, ReactNode } from 'react'
import { brand } from '../styles/brand'

interface ChoiceProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Conteúdo do rótulo (sempre visível). */
  children: ReactNode
  /** checkbox → seleção múltipla; radio → seleção exclusiva. */
  control: 'checkbox' | 'radio'
}

/**
 * Controle selecionável com rótulo visível.
 * checkbox: múltipla escolha. radio: escolha exclusiva (até 5 opções).
 */
export function Choice({ children, control, className, ...rest }: Readonly<ChoiceProps>) {
  const cls = [control === 'checkbox' ? 'gb-checkbox' : 'gb-radio', className]
    .filter(Boolean)
    .join(' ')
  return (
    <label className="gb-choice" style={{ alignItems: 'flex-start' }}>
      <input type={control} className={cls} style={{ marginTop: 2 }} {...rest} />
      <span style={{ fontSize: brand.typography.bodyLarge.fontSize, color: brand.ink, lineHeight: 1.4 }}>
        {children}
      </span>
    </label>
  )
}
