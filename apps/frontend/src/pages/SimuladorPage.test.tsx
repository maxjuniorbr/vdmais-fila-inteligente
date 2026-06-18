import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import { seedStaffSession } from '../test/staffToken'
import { SimuladorPage } from './SimuladorPage'

vi.mock('../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}))

const ERS = [
  { id: 'er-1', name: 'RE Campinas', isDayOpen: true },
  { id: 'er-2', name: 'RE Curitiba', isDayOpen: false },
]

const OVERVIEW_OPEN = {
  isDayOpen: true,
  waiting: [],
  calling: [],
  inService: [],
  paused: [],
}

const OVERVIEW_CLOSED = { ...OVERVIEW_OPEN, isDayOpen: false }

const COUNTERS_FREE = [{ id: 'c-1', number: 1, state: 'UNAVAILABLE', operator: null, isFree: true }]
const COUNTERS_ACTIVE = [{ id: 'c-1', number: 1, state: 'ACTIVE', operator: { id: 'op-1', name: 'Operadora 1' }, isFree: false }]
const OPERATORS = [{ id: 'op-1', name: 'Operadora 1', email: 'op1@gb.com.br', hasOpenCounter: false, counterNumber: null }]
const REPS = [{ id: 're-1', fullName: 'RE Um', reCode: 'RE0001', ticket: null }]

function authenticate() {
  seedStaffSession({ id: 'admin-1', name: 'Admin', role: 'ADMIN' })
}

function mockRefreshReturning(overview = OVERVIEW_OPEN, counters = COUNTERS_FREE) {
  vi.mocked(api.get)
    .mockResolvedValueOnce(ERS)           // /simulation/ers
    .mockResolvedValue(overview)           // subsequent calls all return overview
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url.startsWith('/simulation/ers')) return ERS
    if (url.includes('/simulation/state')) return overview
    if (url.includes('/simulation/operators')) return OPERATORS
    if (url.includes('/simulation/counters')) return counters
    if (url.includes('/simulation/representatives')) return REPS
    return []
  })
}

function renderPage() {
  return render(
    <MemoryRouter>
      <SimuladorPage />
    </MemoryRouter>,
  )
}

describe('SimuladorPage', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset()
    vi.mocked(api.post).mockReset()
  })

  describe('authentication gate', () => {
    it('shows login form when not authenticated', () => {
      vi.mocked(api.get).mockResolvedValue([])
      renderPage()
      expect(screen.getByRole('heading', { name: 'Simulador operacional' })).toBeInTheDocument()
      expect(screen.getByLabelText('E-mail')).toBeInTheDocument()
    })
  })

  describe('authenticated — initial load', () => {
    it('renders the warning alert and section headings', async () => {
      authenticate()
      mockRefreshReturning()
      renderPage()
      expect(await screen.findByText(/Console interno de simulação/)).toBeInTheDocument()
      expect(screen.getByText('Contexto operacional')).toBeInTheDocument()
      expect(screen.getByText('Abrir caixas')).toBeInTheDocument()
      expect(screen.getByText('REs (fila e ações da persona)')).toBeInTheDocument()
      expect(screen.getByText('Atendimento')).toBeInTheDocument()
      expect(screen.getByText('Estado atual')).toBeInTheDocument()
    })

    it('populates the ER select and auto-selects the first ER', async () => {
      authenticate()
      mockRefreshReturning()
      renderPage()
      const select = await screen.findByLabelText('ER ativo')
      expect(select).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'RE Campinas' })).toBeInTheDocument()
    })

    it('shows Dia aberto badge when the day is open', async () => {
      authenticate()
      mockRefreshReturning(OVERVIEW_OPEN)
      renderPage()
      expect(await screen.findByText('Dia aberto')).toBeInTheDocument()
    })

    it('shows Dia fechado badge when the day is closed', async () => {
      authenticate()
      mockRefreshReturning(OVERVIEW_CLOSED)
      renderPage()
      expect(await screen.findByText('Dia fechado')).toBeInTheDocument()
    })

    it('shows queue badge counts from overview', async () => {
      authenticate()
      mockRefreshReturning({
        isDayOpen: true,
        waiting: [{ id: 't-1', code: 'A001' }],
        calling: [],
        inService: [{ id: 't-2', code: 'A002' }],
        paused: [],
      })
      renderPage()
      expect(await screen.findByText('1 aguardando')).toBeInTheDocument()
      expect(screen.getByText('1 em atendimento')).toBeInTheDocument()
    })
  })

  describe('counter actions', () => {
    it('shows Abrir button for a free counter', async () => {
      authenticate()
      mockRefreshReturning(OVERVIEW_OPEN, COUNTERS_FREE)
      renderPage()
      expect(await screen.findByRole('button', { name: 'Abrir' })).toBeInTheDocument()
    })

    it('calls open API and shows toast on success', async () => {
      authenticate()
      mockRefreshReturning(OVERVIEW_OPEN, COUNTERS_FREE)
      vi.mocked(api.post).mockResolvedValue({
        opened: 1,
        skipped: 0,
        results: [{ counterId: 'c-1', opened: true, counterNumber: 1, operator: { name: 'Operadora 1' } }],
      })
      renderPage()
      await userEvent.click(await screen.findByRole('button', { name: 'Abrir' }))
      await waitFor(() => expect(api.post).toHaveBeenCalledWith('/simulation/counters/open', expect.objectContaining({ counterIds: ['c-1'] })))
    })

    it('shows Chamar próxima and Fechar for an active counter', async () => {
      authenticate()
      mockRefreshReturning(OVERVIEW_OPEN, COUNTERS_ACTIVE)
      renderPage()
      expect(await screen.findByRole('button', { name: 'Chamar próxima' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Fechar' })).toBeInTheDocument()
    })

    it('calls call-next API on Chamar próxima click', async () => {
      authenticate()
      mockRefreshReturning(OVERVIEW_OPEN, COUNTERS_ACTIVE)
      vi.mocked(api.post).mockResolvedValue({ code: 'A001' })
      renderPage()
      await userEvent.click(await screen.findByRole('button', { name: 'Chamar próxima' }))
      await waitFor(() => expect(api.post).toHaveBeenCalledWith('/simulation/counters/call-next', { counterId: 'c-1' }))
    })

    it('calls close API on Fechar click', async () => {
      authenticate()
      mockRefreshReturning(OVERVIEW_OPEN, COUNTERS_ACTIVE)
      vi.mocked(api.post).mockResolvedValue({ number: 1 })
      renderPage()
      await userEvent.click(await screen.findByRole('button', { name: 'Fechar' }))
      await waitFor(() => expect(api.post).toHaveBeenCalledWith('/simulation/counters/close', expect.objectContaining({ counterId: 'c-1' })))
    })

    it('shows info tone when opening fails (no free operator)', async () => {
      authenticate()
      mockRefreshReturning(OVERVIEW_OPEN, COUNTERS_FREE)
      vi.mocked(api.post).mockResolvedValue({
        opened: 0,
        skipped: 1,
        results: [{ counterId: 'c-1', opened: false, reason: 'Sem operadora livre disponível' }],
      })
      renderPage()
      await userEvent.click(await screen.findByRole('button', { name: 'Abrir' }))
      await waitFor(() => expect(api.post).toHaveBeenCalled())
    })
  })

  describe('representative (RE) actions', () => {
    it('shows Colocar na fila for a RE without a ticket', async () => {
      authenticate()
      mockRefreshReturning()
      renderPage()
      expect(await screen.findByRole('button', { name: 'Colocar na fila' })).toBeInTheDocument()
    })

    it('calls add-existing API on Colocar na fila', async () => {
      authenticate()
      mockRefreshReturning()
      vi.mocked(api.post).mockResolvedValue({
        included: 1,
        ignored: 0,
        results: [{ representativeId: 're-1', included: true, code: 'A001' }],
      })
      renderPage()
      await userEvent.click(await screen.findByRole('button', { name: 'Colocar na fila' }))
      await waitFor(() => expect(api.post).toHaveBeenCalledWith('/simulation/queue/add-existing', expect.objectContaining({ representativeIds: ['re-1'] })))
    })

    it('shows Não estou pronta and Sair for a WAITING ticket', async () => {
      authenticate()
      vi.mocked(api.get).mockImplementation(async (url: string) => {
        if (url.startsWith('/simulation/ers')) return ERS
        if (url.includes('/simulation/state')) return OVERVIEW_OPEN
        if (url.includes('/simulation/operators')) return OPERATORS
        if (url.includes('/simulation/counters')) return COUNTERS_FREE
        if (url.includes('/simulation/representatives'))
          return [{ id: 're-1', fullName: 'RE Um', reCode: 'RE0001', ticket: { id: 't-1', code: 'A001', state: 'WAITING' } }]
        return []
      })
      renderPage()
      expect(await screen.findByRole('button', { name: 'Não estou pronta' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Sair da fila' })).toBeInTheDocument()
    })

    it('shows Estou pronta and Sair for a PAUSED ticket', async () => {
      authenticate()
      vi.mocked(api.get).mockImplementation(async (url: string) => {
        if (url.startsWith('/simulation/ers')) return ERS
        if (url.includes('/simulation/state')) return OVERVIEW_OPEN
        if (url.includes('/simulation/operators')) return OPERATORS
        if (url.includes('/simulation/counters')) return COUNTERS_FREE
        if (url.includes('/simulation/representatives'))
          return [{ id: 're-1', fullName: 'RE Um', reCode: 'RE0001', ticket: { id: 't-1', code: 'A001', state: 'PAUSED' } }]
        return []
      })
      renderPage()
      expect(await screen.findByRole('button', { name: 'Estou pronta' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Sair da fila' })).toBeInTheDocument()
    })

    it('calls pause API on Não estou pronta click', async () => {
      authenticate()
      vi.mocked(api.get).mockImplementation(async (url: string) => {
        if (url.startsWith('/simulation/ers')) return ERS
        if (url.includes('/simulation/state')) return OVERVIEW_OPEN
        if (url.includes('/simulation/operators')) return OPERATORS
        if (url.includes('/simulation/counters')) return COUNTERS_FREE
        if (url.includes('/simulation/representatives'))
          return [{ id: 're-1', fullName: 'RE Um', reCode: 'RE0001', ticket: { id: 't-1', code: 'A001', state: 'WAITING' } }]
        return []
      })
      vi.mocked(api.post).mockResolvedValue({})
      renderPage()
      await userEvent.click(await screen.findByRole('button', { name: 'Não estou pronta' }))
      await waitFor(() => expect(api.post).toHaveBeenCalledWith('/simulation/queue/pause', { ticketId: 't-1' }))
    })

    it('calls resume API on Estou pronta click', async () => {
      authenticate()
      vi.mocked(api.get).mockImplementation(async (url: string) => {
        if (url.startsWith('/simulation/ers')) return ERS
        if (url.includes('/simulation/state')) return OVERVIEW_OPEN
        if (url.includes('/simulation/operators')) return OPERATORS
        if (url.includes('/simulation/counters')) return COUNTERS_FREE
        if (url.includes('/simulation/representatives'))
          return [{ id: 're-1', fullName: 'RE Um', reCode: 'RE0001', ticket: { id: 't-1', code: 'A001', state: 'PAUSED' } }]
        return []
      })
      vi.mocked(api.post).mockResolvedValue({})
      renderPage()
      await userEvent.click(await screen.findByRole('button', { name: 'Estou pronta' }))
      await waitFor(() => expect(api.post).toHaveBeenCalledWith('/simulation/queue/resume', { ticketId: 't-1' }))
    })

    it('calls cancel API on Sair da fila click', async () => {
      authenticate()
      vi.mocked(api.get).mockImplementation(async (url: string) => {
        if (url.startsWith('/simulation/ers')) return ERS
        if (url.includes('/simulation/state')) return OVERVIEW_OPEN
        if (url.includes('/simulation/operators')) return OPERATORS
        if (url.includes('/simulation/counters')) return COUNTERS_FREE
        if (url.includes('/simulation/representatives'))
          return [{ id: 're-1', fullName: 'RE Um', reCode: 'RE0001', ticket: { id: 't-1', code: 'A001', state: 'WAITING' } }]
        return []
      })
      vi.mocked(api.post).mockResolvedValue({})
      renderPage()
      await userEvent.click(await screen.findByRole('button', { name: 'Sair da fila' }))
      await waitFor(() => expect(api.post).toHaveBeenCalledWith('/simulation/queue/cancel', { ticketId: 't-1' }))
    })
  })

  describe('attendance actions', () => {
    function mockWithCalling() {
      vi.mocked(api.get).mockImplementation(async (url: string) => {
        if (url.startsWith('/simulation/ers')) return ERS
        if (url.includes('/simulation/state'))
          return {
            isDayOpen: true,
            waiting: [],
            calling: [{ id: 't-call', code: 'A001', counter: { number: 1 }, representative: { fullName: 'RE Um' } }],
            inService: [],
            paused: [],
          }
        if (url.includes('/simulation/operators')) return OPERATORS
        if (url.includes('/simulation/counters')) return COUNTERS_ACTIVE
        if (url.includes('/simulation/representatives')) return REPS
        return []
      })
    }

    function mockWithInService() {
      vi.mocked(api.get).mockImplementation(async (url: string) => {
        if (url.startsWith('/simulation/ers')) return ERS
        if (url.includes('/simulation/state'))
          return {
            isDayOpen: true,
            waiting: [],
            calling: [],
            inService: [{ id: 't-svc', code: 'A001', counter: { number: 1 }, representative: { fullName: 'RE Um' } }],
            paused: [],
          }
        if (url.includes('/simulation/operators')) return OPERATORS
        if (url.includes('/simulation/counters')) return COUNTERS_ACTIVE
        if (url.includes('/simulation/representatives')) return REPS
        return []
      })
    }

    it('shows Iniciar atendimento and Não compareceu for CALLING ticket', async () => {
      authenticate()
      mockWithCalling()
      renderPage()
      expect(await screen.findByRole('button', { name: 'Iniciar atendimento' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Não compareceu' })).toBeInTheDocument()
    })

    it('calls start API on Iniciar atendimento', async () => {
      authenticate()
      mockWithCalling()
      vi.mocked(api.post).mockResolvedValue({})
      renderPage()
      await userEvent.click(await screen.findByRole('button', { name: 'Iniciar atendimento' }))
      await waitFor(() => expect(api.post).toHaveBeenCalledWith('/simulation/attendance/start', { ticketId: 't-call' }))
    })

    it('calls no-show API on Não compareceu', async () => {
      authenticate()
      mockWithCalling()
      vi.mocked(api.post).mockResolvedValue({})
      renderPage()
      await userEvent.click(await screen.findByRole('button', { name: 'Não compareceu' }))
      await waitFor(() => expect(api.post).toHaveBeenCalledWith('/simulation/attendance/no-show', { ticketId: 't-call' }))
    })

    it('shows Encerrar atendimento for IN_SERVICE ticket', async () => {
      authenticate()
      mockWithInService()
      renderPage()
      expect(await screen.findByRole('button', { name: 'Encerrar atendimento' })).toBeInTheDocument()
    })

    it('calls finish API on Encerrar atendimento', async () => {
      authenticate()
      mockWithInService()
      vi.mocked(api.post).mockResolvedValue({})
      renderPage()
      await userEvent.click(await screen.findByRole('button', { name: 'Encerrar atendimento' }))
      await waitFor(() => expect(api.post).toHaveBeenCalledWith('/simulation/attendance/finish', { ticketId: 't-svc' }))
    })
  })

  describe('Atualizar estado button', () => {
    it('triggers a refresh when clicked', async () => {
      authenticate()
      mockRefreshReturning()
      renderPage()
      await screen.findByText('Contexto operacional')
      const callsBefore = vi.mocked(api.get).mock.calls.length
      await userEvent.click(screen.getByRole('button', { name: 'Atualizar estado' }))
      await waitFor(() => expect(vi.mocked(api.get).mock.calls.length).toBeGreaterThan(callsBefore))
    })
  })
})
