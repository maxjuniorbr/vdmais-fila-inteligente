import { brand } from '../styles/brand'

interface SpinnerProps {
  size?: number
  label?: string
}

/** Loader genérico para ações sem progresso previsível (H1). */
export function Spinner({ size = 20, label = 'Carregando' }: Readonly<SpinnerProps>) {
  return (
    <span
      className="gb-spinner"
      role="status"
      aria-label={label}
      style={{ display: 'inline-block', width: size, height: size, color: brand.actionable }}
    />
  )
}
