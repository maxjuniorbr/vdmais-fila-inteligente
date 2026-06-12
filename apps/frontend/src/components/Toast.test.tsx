import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider, useToast } from './Toast'

function Harness() {
  const { showToast } = useToast()
  return (
    <div>
      <button onClick={() => showToast('Salvo com sucesso.', 'success')}>Sucesso</button>
      <button onClick={() => showToast('Falhou.', 'error')}>Erro</button>
    </div>
  )
}

describe('Toast', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('shows a toast and dismisses it after the timeout', () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByText('Sucesso'))
    expect(screen.getByText('Salvo com sucesso.')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(4000)
    })
    expect(screen.queryByText('Salvo com sucesso.')).not.toBeInTheDocument()
  })

  it('stacks multiple toasts', () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByText('Sucesso'))
    fireEvent.click(screen.getByText('Erro'))
    expect(screen.getByText('Salvo com sucesso.')).toBeInTheDocument()
    expect(screen.getByText('Falhou.')).toBeInTheDocument()
  })

  it('is a no-op when used without a provider', () => {
    function Lone() {
      const { showToast } = useToast()
      return <button onClick={() => showToast('x')}>Disparar</button>
    }
    render(<Lone />)
    expect(() => fireEvent.click(screen.getByText('Disparar'))).not.toThrow()
  })
})
