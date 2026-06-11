import axe from 'axe-core'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import { OperationPage } from './OperationPage'

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
    sessionStorage.setItem('token', 'test-token')
    sessionStorage.setItem('staffRole', 'OPERATOR')
    sessionStorage.setItem('staffUserId', 'operator-1')
    sessionStorage.setItem('erId', 'er-1')
    sessionStorage.setItem('userName', 'Operadora Teste')

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
})
