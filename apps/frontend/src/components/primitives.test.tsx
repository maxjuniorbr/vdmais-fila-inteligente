import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Input } from './Input'
import { Select } from './Select'
import { SectionPanel } from './SectionPanel'
import { StatusDot } from './StatusDot'
import { AppHeader } from './AppHeader'
import { brand } from '../styles/brand'

describe('Input', () => {
  it('renders with an associated label', () => {
    render(<Input label="Nome" />)
    expect(screen.getByLabelText('Nome')).toBeInTheDocument()
  })

  it('renders without a label', () => {
    render(<Input aria-label="Busca" />)
    expect(screen.getByLabelText('Busca')).toBeInTheDocument()
  })

  it('stays controlled: change fires onChange and value stays pinned to the prop', () => {
    const onChange = vi.fn()
    render(<Input label="Nome" value="Ana" onChange={onChange} />)
    const field = screen.getByLabelText('Nome') as HTMLInputElement
    expect(field.value).toBe('Ana')
    fireEvent.change(field, { target: { value: 'Bia' } })
    expect(onChange).toHaveBeenCalledOnce()
    // Componente controlado: sem novo prop `value`, o campo permanece em 'Ana'.
    expect(field.value).toBe('Ana')
  })
})

describe('Select', () => {
  it('renders a labelled select with its options', () => {
    render(
      <Select label="Perfil">
        <option value="a">A</option>
      </Select>,
    )
    expect(screen.getByLabelText('Perfil')).toBeInstanceOf(HTMLSelectElement)
  })

  it('renders without a label', () => {
    render(
      <Select aria-label="Estado">
        <option value="sp">SP</option>
      </Select>,
    )
    expect(screen.getByLabelText('Estado')).toBeInTheDocument()
  })

  it('stays controlled: change fires onChange and value stays pinned to the prop', () => {
    const onChange = vi.fn()
    render(
      <Select label="Perfil" value="ADMIN" onChange={onChange}>
        <option value="ADMIN">Administrador</option>
        <option value="ATTENDANT">Atendente</option>
      </Select>,
    )
    const field = screen.getByLabelText('Perfil') as HTMLSelectElement
    expect(field.value).toBe('ADMIN')
    fireEvent.change(field, { target: { value: 'ATTENDANT' } })
    expect(onChange).toHaveBeenCalledOnce()
    // Componente controlado: sem novo prop `value`, a seleção volta para 'ADMIN'.
    expect(field.value).toBe('ADMIN')
  })
})

describe('StatusDot', () => {
  it('defaults to the muted border token', () => {
    const { container } = render(<StatusDot />)
    const dot = container.querySelector('span') as HTMLElement
    expect(dot.style.background).toBe('rgb(148, 163, 184)') // brand.borderMuted #94a3b8
  })

  it('honors a custom color and size', () => {
    const { container } = render(<StatusDot color={brand.success} size={16} />)
    const dot = container.querySelector('span') as HTMLElement
    expect(dot.style.width).toBe('16px')
  })
})

describe('SectionPanel', () => {
  it('renders the label and the count badge', () => {
    render(
      <SectionPanel label="Aguardando" count={5}>
        <p>conteúdo</p>
      </SectionPanel>,
    )
    expect(screen.getByText('Aguardando')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('conteúdo')).toBeInTheDocument()
  })

  it('omits the badge when no count is provided', () => {
    render(
      <SectionPanel label="Pausados">
        <p>x</p>
      </SectionPanel>,
    )
    expect(screen.getByText('Pausados')).toBeInTheDocument()
  })
})

describe('AppHeader', () => {
  it('renders title, subtitle, actions and a logout button', () => {
    const onLogout = vi.fn()
    render(
      <AppHeader
        title="Painel"
        subtitle="ER Centro"
        actions={<button>Extra</button>}
        onLogout={onLogout}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Painel' })).toBeInTheDocument()
    expect(screen.getByText('ER Centro')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Extra' })).toBeInTheDocument()
    const logout = screen.getByRole('button', { name: 'Sair' })
    fireEvent.click(logout)
    expect(onLogout).toHaveBeenCalledOnce()
  })
})
