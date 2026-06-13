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

  it('shows the brand, status, section panel and copy field components', () => {
    render(<PlaygroundPage />)
    expect(screen.getByText('VD+ Fila Inteligente')).toBeInTheDocument()
    expect(screen.getByText('Caixa ativo')).toBeInTheDocument()
    expect(screen.getByText('Senhas em espera')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copiar Link público da fila' })).toBeInTheDocument()
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

  it('runs the table row action menu items as toasts', () => {
    render(<PlaygroundPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Ações do pedido #PED-8812' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ver detalhes' }))
    expect(screen.getByText('Detalhes de #PED-8812.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Ações do pedido #PED-8812' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Cancelar pedido' }))
    expect(screen.getByText('Pedido cancelado.')).toBeInTheDocument()
  })

  it('closes the destructive modal from its close affordance', () => {
    render(<PlaygroundPage />)
    fireEvent.click(screen.getByRole('button', { name: '4. Interações' }))
    fireEvent.click(screen.getByRole('button', { name: 'Excluir conta' }))

    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fechar' }))
    expect(screen.queryByText('Excluir conta permanentemente?')).not.toBeInTheDocument()
  })

  it('closes the bottom sheet from the share option', () => {
    render(<PlaygroundPage />)
    fireEvent.click(screen.getByRole('button', { name: '4. Interações' }))
    fireEvent.click(screen.getByRole('button', { name: 'Abrir opções' }))

    fireEvent.click(screen.getByRole('button', { name: 'Compartilhar' }))
    expect(screen.queryByText('Opções rápidas')).not.toBeInTheDocument()
  })

  it('closes the bottom sheet from the download option', () => {
    render(<PlaygroundPage />)
    fireEvent.click(screen.getByRole('button', { name: '4. Interações' }))
    fireEvent.click(screen.getByRole('button', { name: 'Abrir opções' }))

    fireEvent.click(screen.getByRole('button', { name: 'Baixar comprovante' }))
    expect(screen.queryByText('Opções rápidas')).not.toBeInTheDocument()
  })

  it('closes the bottom sheet from its backdrop affordance', () => {
    render(<PlaygroundPage />)
    fireEvent.click(screen.getByRole('button', { name: '4. Interações' }))
    fireEvent.click(screen.getByRole('button', { name: 'Abrir opções' }))

    const sheet = screen.getByRole('dialog', { name: 'Opções rápidas' })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Fechar' }))
    expect(screen.queryByText('Opções rápidas')).not.toBeInTheDocument()
  })

  it('navigates each drawer link, closing the drawer', () => {
    render(<PlaygroundPage />)
    fireEvent.click(screen.getByRole('button', { name: '4. Interações' }))

    for (const link of ['Início', 'Fila', 'Minha conta']) {
      fireEvent.click(screen.getByRole('button', { name: 'Abrir menu' }))
      fireEvent.click(screen.getByRole('link', { name: link }))
      expect(screen.queryByText('Minha conta')).not.toBeInTheDocument()
    }
  })

  it('closes the drawer from its close control', () => {
    render(<PlaygroundPage />)
    fireEvent.click(screen.getByRole('button', { name: '4. Interações' }))
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menu' }))

    fireEvent.click(screen.getByRole('button', { name: 'Fechar menu' }))
    expect(screen.queryByText('Minha conta')).not.toBeInTheDocument()
  })
})
