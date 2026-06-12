import type { CSSProperties, ReactNode } from 'react'
import { brand } from '../styles/brand'

export interface Column<T> {
  /** Identificador único da coluna. */
  key: string
  /** Conteúdo do cabeçalho. */
  header: ReactNode
  /** Rótulo curto usado no modo card (container estreito). Padrão: header se string. */
  label?: string
  /** Alinhamento do conteúdo. Padrão: left. */
  align?: 'left' | 'right' | 'center'
  /** Renderiza a célula a partir da linha. Sem render, usa row[key]. */
  render?: (row: T) => ReactNode
}

interface TableProps<T> {
  columns: Column<T>[]
  rows: T[]
  getRowKey: (row: T) => string
  /** Mensagem exibida quando não há linhas. */
  emptyMessage?: string
  /** Legenda acessível da tabela. */
  caption?: string
}

/**
 * Tabela de dados tabulares. Estilo via classes `.gb-table` (theme.css):
 * cabeçalho em maiúsculas, linhas com hover. Em containers estreitos, colapsa
 * para o padrão "card" (cada linha vira um cartão rótulo:valor) via container
 * query — evitando barra de rolagem horizontal dentro de blocos pequenos.
 */
export function Table<T>({
  columns,
  rows,
  getRowKey,
  emptyMessage = 'Nenhum registro para exibir.',
  caption,
}: Readonly<TableProps<T>>) {
  return (
    <div className="gb-table-shell">
      <div className="gb-table-wrap">
        <table className="gb-table">
          {caption && <caption style={srOnly}>{caption}</caption>}
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} style={alignStyle(column.align)}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="gb-table-empty" style={emptyCell}>
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={getRowKey(row)}>
                  {columns.map((column) => (
                    <td key={column.key} data-label={cardLabel(column)} style={alignStyle(column.align)}>
                      {column.render
                        ? column.render(row)
                        : String((row as Record<string, unknown>)[column.key] ?? '')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function cardLabel<T>(column: Column<T>): string {
  if (column.label) return column.label
  return typeof column.header === 'string' ? column.header : ''
}

function alignStyle(align: Column<unknown>['align']): CSSProperties | undefined {
  return align && align !== 'left' ? { textAlign: align } : undefined
}

const emptyCell: CSSProperties = {
  textAlign: 'center',
  color: brand.inkMuted,
  padding: `${brand.spacing[24]}px`,
}

const srOnly: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
}
