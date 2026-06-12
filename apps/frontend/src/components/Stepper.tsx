import { Fragment } from 'react'
import type { CSSProperties } from 'react'
import { brand } from '../styles/brand'

interface StepperProps {
  steps: string[]
  /** Índice (base 0) da etapa atual. Etapas anteriores ficam concluídas. */
  current: number
}

/** Indicador de progresso por etapas (H1 — visibilidade do status). */
export function Stepper({ steps, current }: Readonly<StepperProps>) {
  return (
    <ol style={styles.list} aria-label="Progresso">
      {steps.map((step, index) => {
        const done = index < current
        const active = index === current
        const reached = done || active
        return (
          <Fragment key={step}>
            <li style={styles.step} aria-current={active ? 'step' : undefined}>
              <span
                style={{
                  ...styles.bullet,
                  background: reached ? brand.actionable : brand.surface,
                  border: `2px solid ${reached ? brand.actionable : brand.borderStrong}`,
                  color: reached ? brand.actionableContent : brand.inkMuted,
                }}
              >
                {done ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                ) : (
                  index + 1
                )}
              </span>
              <span style={{ ...styles.label, color: reached ? brand.ink : brand.inkMuted }}>
                {step}
              </span>
            </li>
            {index < steps.length - 1 && (
              <span
                aria-hidden="true"
                style={{
                  ...styles.bar,
                  background: index < current ? brand.actionable : brand.border,
                }}
              />
            )}
          </Fragment>
        )
      })}
    </ol>
  )
}

const styles: Record<string, CSSProperties> = {
  list: {
    display: 'flex',
    alignItems: 'center',
    gap: `${brand.spacing[8]}px`,
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  step: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: `${brand.spacing[8]}px`,
  },
  bullet: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    borderRadius: '50%',
    fontSize: brand.typography.bodySmall.fontSize,
    fontWeight: 700,
  },
  label: {
    fontSize: brand.typography.auxiliar.fontSize,
    fontWeight: 500,
    textAlign: 'center',
  },
  bar: {
    flex: 1,
    height: 2,
    marginBottom: 26,
    borderRadius: brand.radius.pill,
  },
}
