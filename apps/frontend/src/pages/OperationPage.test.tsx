import axe from 'axe-core'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import { seedStaffSession } from '../test/staffToken'
import { OperationPage } from './OperationPage'

const counters = [
  {
    id: 'counter-1',
    number: 1,
    state: 'ACTIVE',
    operator: { id: 'operator-1', name: 'Operadora Teste' },
  },
]

function overviewWith(waiting: unknown[]) {
  return { isDayOpen: true, waiting, calling: [], inService: [], paused: [], recent: [], counters }
}

vi.mock('../api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

vi.mock('../hooks/useSocket', () => ({
  useSocket: () => null,
}))

const showToast = vi.fn()
vi.mock('../components/Toast', () => ({
  useToast: () => ({ showToast }),
}))

describe('OperationPage accessibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    seedStaffSession({ id: 'operator-1', name: 'Operadora Teste', role: 'OPERATOR', erId: 'er-1' })

    vi.mocked(api.get).mockResolvedValue({
      waiting: [],
      calling: [],
      inService: [],
      paused: [],
      recent: [],
      counters: [
        {
          id: 'counter-1',
          number: 1,
          state: 'ACTIVE',
          operator: { id: 'operator-1', name: 'Operadora Teste' },
        },
      ],
    })
  })

  it('labels the counter and pause-reason controls and has no axe violations', async () => {
    render(<OperationPage />)

    expect(await screen.findByLabelText('Caixa de atendimento')).toBeInTheDocument()
    expect(screen.getByLabelText('Motivo da pausa')).toBeInTheDocument()

    expect(
      (
        await axe.run(document.body, {
          rules: { 'color-contrast': { enabled: false } },
        })
      ).violations,
    ).toEqual([])
  })

  it('shows a preferential badge on a priority waiting ticket', async () => {
    vi.mocked(api.get).mockResolvedValue(
      overviewWith([
        { id: 'tk-1', code: 'A001', state: 'WAITING', isPriority: true, representative: { fullName: 'Maria' } },
      ]),
    )

    render(<OperationPage />)

    expect(await screen.findByText('Preferencial')).toBeInTheDocument()
  })

  it('marks a waiting ticket as preferential from the action menu', async () => {
    vi.mocked(api.get).mockResolvedValue(
      overviewWith([
        { id: 'tk-1', code: 'A001', state: 'WAITING', isPriority: false, representative: { fullName: 'Maria' } },
      ]),
    )
    vi.mocked(api.post).mockResolvedValue({})

    render(<OperationPage />)

    fireEvent.click(await screen.findByRole('button', { name: 'Ações da senha A001' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Marcar preferencial' }))

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/tickets/tk-1/mark-priority'),
    )
  })

  it('removes the preferential flag from a waiting ticket via the action menu', async () => {
    vi.mocked(api.get).mockResolvedValue(
      overviewWith([
        { id: 'tk-1', code: 'A001', state: 'WAITING', isPriority: true, representative: { fullName: 'Maria' } },
      ]),
    )
    vi.mocked(api.post).mockResolvedValue({})

    render(<OperationPage />)

    fireEvent.click(await screen.findByRole('button', { name: 'Ações da senha A001' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remover preferencial' }))

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/tickets/tk-1/unmark-priority'),
    )
    expect(showToast).toHaveBeenCalledWith('Prioridade removida.', 'success')
  })

  it('blocks "Chamar próximo" while a ticket is open on the own counter', async () => {
    vi.mocked(api.get).mockResolvedValue({
      isDayOpen: true,
      waiting: [],
      calling: [
        {
          id: 'tk-1',
          code: 'A001',
          state: 'CALLING',
          calledAt: new Date().toISOString(),
          counter: { id: 'counter-1', number: 1 },
        },
      ],
      inService: [],
      paused: [],
      recent: [],
      counters,
    })

    render(<OperationPage />)

    const callButton = await screen.findByRole('button', { name: 'Chamar próximo' })
    expect(callButton).toBeDisabled()
    expect(screen.getByText('Conclua a senha atual antes de chamar a próxima.')).toBeInTheDocument()

    fireEvent.keyDown(document.body, { key: 'Enter' })

    expect(api.post).not.toHaveBeenCalledWith(
      '/queues/er-1/call-next',
      expect.anything(),
    )
  })

  it('hides queue actions and disables the option for another operator\'s counter', async () => {
    vi.mocked(api.get).mockResolvedValue({
      isDayOpen: true,
      waiting: [
        { id: 'tk-1', code: 'A001', state: 'WAITING', isPriority: false, representative: { fullName: 'Maria' } },
      ],
      calling: [],
      inService: [],
      paused: [],
      recent: [],
      counters: [
        {
          id: 'counter-2',
          number: 2,
          state: 'ACTIVE',
          operator: { id: 'outra-op', name: 'Outra' },
        },
      ],
    })

    render(<OperationPage />)

    const select = await screen.findByLabelText('Caixa de atendimento')
    fireEvent.change(select, { target: { value: 'counter-2' } })

    expect(screen.queryByRole('button', { name: 'Ações da senha A001' })).not.toBeInTheDocument()

    const option = screen.getByRole('option', { name: /Caixa 2 - Ativo \(Outra\)/ })
    expect(option).toBeDisabled()
  })

  it('disables "Assumir e abrir caixa" while the day is closed', async () => {
    vi.mocked(api.get).mockResolvedValue({
      isDayOpen: false,
      waiting: [],
      calling: [],
      inService: [],
      paused: [],
      recent: [],
      counters: [
        {
          id: 'counter-3',
          number: 3,
          state: 'UNAVAILABLE',
          operator: null,
        },
      ],
    })

    render(<OperationPage />)

    const select = await screen.findByLabelText('Caixa de atendimento')
    fireEvent.change(select, { target: { value: 'counter-3' } })

    expect(await screen.findByRole('button', { name: 'Assumir e abrir caixa' })).toBeDisabled()
  })
})
