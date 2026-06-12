import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Stepper } from './Stepper'

const steps = ['Dados', 'Endereço', 'Revisão']

describe('Stepper', () => {
  it('renders every step label', () => {
    render(<Stepper steps={steps} current={1} />)
    steps.forEach((label) => expect(screen.getByText(label)).toBeInTheDocument())
  })

  it('marks the current step with aria-current', () => {
    render(<Stepper steps={steps} current={1} />)
    const items = screen.getAllByRole('listitem')
    expect(items[1]).toHaveAttribute('aria-current', 'step')
    expect(items[0]).not.toHaveAttribute('aria-current')
  })

  it('shows the step number for upcoming steps', () => {
    render(<Stepper steps={steps} current={1} />)
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('exposes an accessible progress list', () => {
    render(<Stepper steps={steps} current={0} />)
    expect(screen.getByRole('list', { name: 'Progresso' })).toBeInTheDocument()
  })
})
