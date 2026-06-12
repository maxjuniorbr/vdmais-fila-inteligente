import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Table, type Column } from './Table'

interface Row {
  id: string
  name: string
  value: number
}

const rows: Row[] = [
  { id: '1', name: 'Ana', value: 10 },
  { id: '2', name: 'Bia', value: 20 },
]

const columns: Column<Row>[] = [
  { key: 'name', header: 'Nome', render: (row) => row.name },
  { key: 'value', header: 'Valor', align: 'right', render: (row) => row.value },
]

describe('Table', () => {
  it('renders headers, rows and the sr-only caption', () => {
    render(<Table columns={columns} rows={rows} getRowKey={(row) => row.id} caption="Pedidos" />)
    expect(screen.getByText('Nome')).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Pedidos' })).toBeInTheDocument()
    expect(screen.getByText('Ana')).toBeInTheDocument()
    expect(screen.getByText('Bia')).toBeInTheDocument()
    expect(screen.getByText('20')).toBeInTheDocument()
  })

  it('falls back to row[key] when a column has no render', () => {
    const cols: Column<Row>[] = [{ key: 'name', header: 'Nome' }]
    render(<Table columns={cols} rows={rows} getRowKey={(row) => row.id} />)
    expect(screen.getByText('Ana')).toBeInTheDocument()
  })

  it('shows the empty message with no rows', () => {
    render(<Table columns={columns} rows={[]} getRowKey={(row) => row.id} emptyMessage="Vazio" />)
    expect(screen.getByText('Vazio')).toBeInTheDocument()
  })

  it('sets data-label on cells for the responsive card mode', () => {
    render(<Table columns={columns} rows={rows} getRowKey={(row) => row.id} />)
    expect(screen.getByText('Ana')).toHaveAttribute('data-label', 'Nome')
  })
})
