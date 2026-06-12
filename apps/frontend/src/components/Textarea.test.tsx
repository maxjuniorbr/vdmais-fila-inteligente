import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Textarea } from './Textarea'

describe('Textarea', () => {
  it('associates the visible label with the field', () => {
    render(<Textarea label="Observações" />)
    expect(screen.getByLabelText('Observações')).toBeInstanceOf(HTMLTextAreaElement)
  })

  it('fires onChange and shows the value', () => {
    const onChange = vi.fn()
    render(<Textarea label="Nota" value="texto" onChange={onChange} />)
    const field = screen.getByLabelText('Nota')
    expect(field).toHaveValue('texto')
    fireEvent.change(field, { target: { value: 'novo' } })
    expect(onChange).toHaveBeenCalledOnce()
  })

  it('renders without a label when none is provided', () => {
    render(<Textarea aria-label="Sem rótulo" />)
    expect(screen.getByLabelText('Sem rótulo')).toBeInTheDocument()
  })
})
