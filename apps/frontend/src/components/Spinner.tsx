import { brand } from '../styles/brand'

interface SpinnerProps {
  size?: number
  label?: string
}

export function Spinner({ size = 20, label = 'Carregando' }: Readonly<SpinnerProps>) {
  return (
    <output
      className="gb-spinner"
      aria-label={label}
      style={{ display: 'inline-block', width: size, height: size, color: brand.actionable }}
    />
  )
}
