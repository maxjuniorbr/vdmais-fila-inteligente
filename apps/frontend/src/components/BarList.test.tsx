import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BarList } from './BarList'

describe('BarList', () => {
  it('renders an empty message when there are no items', () => {
    render(<BarList items={[]} emptyMessage="Sem dados" />)
    expect(screen.getByText('Sem dados')).toBeInTheDocument()
  })

  it('renders each item with an accessible label and display value', () => {
    render(
      <BarList
        items={[
          { label: '09h', value: 4 },
          { label: '10h', value: 12, display: '12 atend.', highlight: true },
        ]}
      />,
    )
    expect(screen.getByText('09h')).toBeInTheDocument()
    expect(screen.getByText('12 atend.')).toBeInTheDocument()
    expect(screen.getByLabelText('10h: 12 atend.')).toBeInTheDocument()
  })

  it('falls back to the numeric value when no display is provided', () => {
    render(<BarList items={[{ label: '08h', value: 7 }]} />)
    expect(screen.getByLabelText('08h: 7')).toBeInTheDocument()
  })
})
