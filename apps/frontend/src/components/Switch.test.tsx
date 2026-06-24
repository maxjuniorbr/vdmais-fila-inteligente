import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Switch } from './Switch'

describe('Switch', () => {
  it('renders a labelled switch', () => {
    render(<Switch label="Notificações por SMS" />)
    const control = screen.getByRole('switch', { name: 'Notificações por SMS' })
    expect(control).toBeInTheDocument()
    expect(control).not.toBeChecked()
  })

  it('reflects the checked state and fires onChange', () => {
    const onChange = vi.fn()
    render(<Switch label="Ativar" checked onChange={onChange} />)
    const control = screen.getByRole('switch', { name: 'Ativar' })
    expect(control).toBeChecked()
    fireEvent.click(control)
    expect(onChange).toHaveBeenCalledOnce()
  })

  it('can be disabled', () => {
    render(<Switch label="Bloqueado" disabled />)
    expect(screen.getByRole('switch', { name: 'Bloqueado' })).toBeDisabled()
  })

  it('stays controlled: click fires onChange but does not flip checked on its own', () => {
    const onChange = vi.fn()
    render(<Switch label="Controlado" checked={false} onChange={onChange} />)
    const control = screen.getByRole('switch', { name: 'Controlado' })
    expect(control).not.toBeChecked()
    fireEvent.click(control)
    expect(onChange).toHaveBeenCalledOnce()
    // Sem novo prop `checked`, o componente controlado permanece desmarcado.
    expect(control).not.toBeChecked()
  })
})
