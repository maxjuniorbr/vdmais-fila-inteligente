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

  it('renders fallback cell values for every primitive and object type', () => {
    interface MixedRow {
      id: string
      text: string
      count: number
      flag: boolean
      big: bigint
      meta: { label: string }
      empty: null
      sym: symbol
    }
    const mixedRows: MixedRow[] = [
      {
        id: '1',
        text: 'hello',
        count: 42,
        flag: true,
        big: 9007199254740993n,
        meta: { label: 'tag' },
        empty: null,
        sym: Symbol('x'),
      },
    ]
    const mixedColumns: Column<MixedRow>[] = [
      { key: 'text', header: 'Texto' },
      { key: 'count', header: 'Contagem' },
      { key: 'flag', header: 'Flag' },
      { key: 'big', header: 'Big' },
      { key: 'meta', header: 'Meta' },
      { key: 'empty', header: 'Vazio' },
      { key: 'sym', header: 'Simbolo' },
    ]
    const { container } = render(
      <Table columns={mixedColumns} rows={mixedRows} getRowKey={(row) => row.id} />,
    )
    expect(screen.getByText('hello')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('true')).toBeInTheDocument()
    expect(screen.getByText('9007199254740993')).toBeInTheDocument()
    expect(screen.getByText('{"label":"tag"}')).toBeInTheDocument()
    const emptyCell = container.querySelector('td[data-label="Vazio"]')
    expect(emptyCell).toHaveTextContent('')
    const symbolCell = container.querySelector('td[data-label="Simbolo"]')
    expect(symbolCell).toHaveTextContent('')
  })
})
