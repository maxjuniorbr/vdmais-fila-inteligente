import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Choice } from './Choice'

describe('Choice', () => {
  it('renders a labelled checkbox', () => {
    render(<Choice control="checkbox">Aceito os termos</Choice>)
    expect(screen.getByRole('checkbox', { name: 'Aceito os termos' })).toBeInTheDocument()
  })

  it('renders a radio and reflects the checked state', () => {
    render(
      <Choice control="radio" name="tipo" defaultChecked>
        Casa
      </Choice>,
    )
    expect(screen.getByRole('radio', { name: 'Casa' })).toBeChecked()
  })

  it('fires onChange when an unselected radio is chosen', () => {
    const onChange = vi.fn()
    render(
      <Choice control="radio" name="tipo" onChange={onChange}>
        Apartamento
      </Choice>,
    )
    fireEvent.click(screen.getByRole('radio', { name: 'Apartamento' }))
    expect(onChange).toHaveBeenCalledOnce()
  })

  it('forwards the disabled state', () => {
    render(
      <Choice control="checkbox" disabled>
        Indisponível
      </Choice>,
    )
    expect(screen.getByRole('checkbox', { name: 'Indisponível' })).toBeDisabled()
  })
})
