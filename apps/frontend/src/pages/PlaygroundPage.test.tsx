import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlaygroundPage } from './PlaygroundPage'

describe('PlaygroundPage', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('refreshes with a skeleton and raises a success toast', () => {
    render(<PlaygroundPage />)
    expect(screen.getByRole('heading', { name: 'Design Playground' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Atualizar base' }))
    expect(screen.getByRole('button', { name: 'Atualizando...' })).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1400)
    })
    expect(screen.getByText('Base atualizada com sucesso.')).toBeInTheDocument()
  })

  it('cycles through the data states', () => {
    render(<PlaygroundPage />)
    fireEvent.click(screen.getByRole('button', { name: '3. Estados' }))
    fireEvent.click(screen.getByRole('button', { name: 'Vazio' }))
    expect(screen.getByRole('heading', { name: 'Nenhum dado encontrado' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Recarregar tela' }))
    expect(screen.getByText('Ciclo atual')).toBeInTheDocument()
  })

  it('opens overlays and fires a toast from the interactions tab', () => {
    render(<PlaygroundPage />)
    fireEvent.click(screen.getByRole('button', { name: '4. Interações' }))

    fireEvent.click(screen.getByRole('button', { name: 'Excluir conta' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Excluir conta permanentemente?')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))

    fireEvent.click(screen.getByRole('button', { name: 'Abrir opções' }))
    expect(screen.getByText('Opções rápidas')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Sucesso' }))
    expect(screen.getByText('Ação concluída.')).toBeInTheDocument()
  })

  it('renders the form tab with a stepper', () => {
    render(<PlaygroundPage />)
    fireEvent.click(screen.getByRole('button', { name: '2. Formulário' }))
    expect(screen.getByRole('list', { name: 'Progresso' })).toBeInTheDocument()
    expect(screen.getByLabelText('CEP')).toBeInTheDocument()
  })

  it('shows the loading state of the data tab', () => {
    render(<PlaygroundPage />)
    fireEvent.click(screen.getByRole('button', { name: '3. Estados' }))
    fireEvent.click(screen.getByRole('button', { name: 'Carregando' }))
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument()
  })

  it('confirms the destructive modal and raises a toast', () => {
    render(<PlaygroundPage />)
    fireEvent.click(screen.getByRole('button', { name: '4. Interações' }))
    fireEvent.click(screen.getByRole('button', { name: 'Excluir conta' }))

    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sim, excluir' }))
    expect(screen.getByText('Conta excluída.')).toBeInTheDocument()
  })

  it('opens the drawer and raises an error toast', () => {
    render(<PlaygroundPage />)
    fireEvent.click(screen.getByRole('button', { name: '4. Interações' }))

    fireEvent.click(screen.getByRole('button', { name: 'Abrir menu' }))
    expect(screen.getByText('Minha conta')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Erro' }))
    expect(screen.getByText('Falha na comunicação.')).toBeInTheDocument()
  })

  it('expands an accordion item in the interactions tab', () => {
    render(<PlaygroundPage />)
    fireEvent.click(screen.getByRole('button', { name: '4. Interações' }))

    fireEvent.click(screen.getByRole('button', { name: 'Como funciona a chamada de senha?' }))
    expect(screen.getByText(/A senha aparece no painel/)).toBeVisible()
  })

  it('toggles the switch and saves the address with a toast', () => {
    render(<PlaygroundPage />)
    fireEvent.click(screen.getByRole('switch', { name: 'Notificações por SMS' }))
    expect(screen.getByText('Preferência atualizada.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '2. Formulário' }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar endereço' }))
    expect(screen.getByText('Endereço salvo.')).toBeInTheDocument()
  })
})
