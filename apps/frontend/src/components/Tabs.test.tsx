import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Tabs, type TabItem } from './Tabs'

const tabs: TabItem[] = [
  { id: 'a', label: 'Aba A', content: <p>Conteúdo A</p> },
  { id: 'b', label: 'Aba B', content: <p>Conteúdo B</p> },
  { id: 'c', label: 'Aba C', content: <p>Conteúdo C</p> },
]

describe('Tabs', () => {
  it('renders the first tab active by default', () => {
    render(<Tabs tabs={tabs} ariaLabel="Exemplo" />)
    expect(screen.getByRole('tab', { name: 'Aba A' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Conteúdo A')).toBeVisible()
    expect(screen.queryByText('Conteúdo B')).not.toBeInTheDocument()
  })

  it('honors initialId', () => {
    render(<Tabs tabs={tabs} ariaLabel="Exemplo" initialId="c" />)
    expect(screen.getByRole('tab', { name: 'Aba C' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Conteúdo C')).toBeVisible()
  })

  it('switches the active tab on click', () => {
    render(<Tabs tabs={tabs} ariaLabel="Exemplo" />)
    fireEvent.click(screen.getByRole('tab', { name: 'Aba B' }))
    expect(screen.getByRole('tab', { name: 'Aba B' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Conteúdo B')).toBeVisible()
  })

  it('uses roving tabindex', () => {
    render(<Tabs tabs={tabs} ariaLabel="Exemplo" />)
    expect(screen.getByRole('tab', { name: 'Aba A' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('tab', { name: 'Aba B' })).toHaveAttribute('tabindex', '-1')
  })

  it('navigates with ArrowRight/ArrowLeft (wraps), Home and End', () => {
    render(<Tabs tabs={tabs} ariaLabel="Exemplo" />)
    const a = screen.getByRole('tab', { name: 'Aba A' })
    a.focus()
    fireEvent.keyDown(a, { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: 'Aba B' })).toHaveFocus()

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Aba B' }), { key: 'End' })
    expect(screen.getByRole('tab', { name: 'Aba C' })).toHaveFocus()

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Aba C' }), { key: 'Home' })
    expect(screen.getByRole('tab', { name: 'Aba A' })).toHaveFocus()

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Aba A' }), { key: 'ArrowLeft' })
    expect(screen.getByRole('tab', { name: 'Aba C' })).toHaveFocus()
  })

  it('falls back to a valid tab when the active one is removed from the set', () => {
    const { rerender } = render(<Tabs tabs={tabs} ariaLabel="Exemplo" initialId="c" />)
    expect(screen.getByText('Conteúdo C')).toBeVisible()

    // Drop tab C (the active one). Previously no tab stayed selected and every
    // panel rendered hidden, leaving the content blank with no way to recover.
    rerender(<Tabs tabs={tabs.slice(0, 2)} ariaLabel="Exemplo" initialId="c" />)

    expect(screen.getByRole('tab', { name: 'Aba A' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Conteúdo A')).toBeVisible()
    expect(screen.queryByRole('tab', { name: 'Aba C' })).not.toBeInTheDocument()
  })

  it('connects panel to tab via aria attributes', () => {
    render(<Tabs tabs={tabs} ariaLabel="Exemplo" />)
    const tab = screen.getByRole('tab', { name: 'Aba A' })
    const panel = screen.getByRole('tabpanel')
    expect(panel).toHaveAttribute('aria-labelledby', tab.id)
    expect(tab).toHaveAttribute('aria-controls', panel.id)
  })
})
