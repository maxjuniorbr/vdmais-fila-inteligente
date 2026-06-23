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
  return { waiting, calling: [], inService: [], paused: [], recent: [], counters }
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

describe('OperationPage accessibility', () => {
  beforeEach(() => {
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
})
