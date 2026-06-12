import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Skeleton } from './Skeleton'
import { Spinner } from './Spinner'
import { EmptyState } from './EmptyState'
import { MetricCard } from './MetricCard'
import { Badge } from './Badge'

describe('Skeleton', () => {
  it('renders a decorative placeholder with the given dimensions', () => {
    const { container } = render(<Skeleton width={120} height={20} radius="pill" />)
    const node = container.querySelector('.gb-skeleton') as HTMLElement
    expect(node).toBeInTheDocument()
    expect(node).toHaveAttribute('aria-hidden', 'true')
    expect(node.style.width).toBe('120px')
    expect(node.style.height).toBe('20px')
  })
})

describe('Spinner', () => {
  it('exposes a status role with an accessible label', () => {
    render(<Spinner label="Processando" />)
    expect(screen.getByRole('status', { name: 'Processando' })).toBeInTheDocument()
  })

  it('defaults the label to "Carregando"', () => {
    render(<Spinner />)
    expect(screen.getByRole('status', { name: 'Carregando' })).toBeInTheDocument()
  })
})

describe('EmptyState', () => {
  it('renders title, description, icon and action', () => {
    render(
      <EmptyState
        title="Nada aqui"
        description="Não há registros."
        icon={<svg data-testid="ico" />}
        action={<button>Recarregar</button>}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Nada aqui' })).toBeInTheDocument()
    expect(screen.getByText('Não há registros.')).toBeInTheDocument()
    expect(screen.getByTestId('ico')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Recarregar' })).toBeInTheDocument()
  })

  it('renders only the title when optional props are omitted', () => {
    render(<EmptyState title="Vazio" />)
    expect(screen.getByRole('heading', { name: 'Vazio' })).toBeInTheDocument()
  })
})

describe('MetricCard', () => {
  it('renders the value and label', () => {
    render(<MetricCard label="Senhas" value={42} />)
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('Senhas')).toBeInTheDocument()
  })
})

describe('Badge', () => {
  it('renders content for each tone', () => {
    const { rerender } = render(<Badge>12</Badge>)
    expect(screen.getByText('12')).toBeInTheDocument()
    for (const tone of ['success', 'warning', 'info', 'danger', 'neutral'] as const) {
      rerender(<Badge tone={tone}>{tone}</Badge>)
      expect(screen.getByText(tone)).toBeInTheDocument()
    }
  })
})
