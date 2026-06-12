import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Accordion } from './Accordion'

const items = [
  { id: '1', title: 'Pergunta 1', content: <p>Resposta 1</p> },
  { id: '2', title: 'Pergunta 2', content: <p>Resposta 2</p> },
]

describe('Accordion', () => {
  it('starts collapsed and expands an item on click', () => {
    render(<Accordion items={items} />)
    const trigger = screen.getByRole('button', { name: 'Pergunta 1' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Resposta 1')).toBeVisible()
  })

  it('keeps a single item open by default', () => {
    render(<Accordion items={items} />)
    fireEvent.click(screen.getByRole('button', { name: 'Pergunta 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pergunta 2' }))
    expect(screen.getByRole('button', { name: 'Pergunta 1' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    expect(screen.getByRole('button', { name: 'Pergunta 2' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })

  it('allows multiple open items when allowMultiple is set', () => {
    render(<Accordion items={items} allowMultiple />)
    fireEvent.click(screen.getByRole('button', { name: 'Pergunta 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pergunta 2' }))
    expect(screen.getByRole('button', { name: 'Pergunta 1' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Pergunta 2' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })

  it('collapses an open item when clicked again', () => {
    render(<Accordion items={items} />)
    const trigger = screen.getByRole('button', { name: 'Pergunta 1' })
    fireEvent.click(trigger)
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })
})
