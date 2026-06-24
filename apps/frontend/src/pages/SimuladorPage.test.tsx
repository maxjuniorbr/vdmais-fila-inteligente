import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import { brand } from '../styles/brand'
import { seedStaffSession } from '../test/staffToken'
import { SimuladorPage } from './SimuladorPage'

vi.mock('../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}))

interface MockTicket {
  id: string
  code: string
  counter?: { number: number }
  representative?: { fullName: string }
}
interface MockOverview {
  isDayOpen: boolean
  waiting: MockTicket[]
  calling: MockTicket[]
  inService: MockTicket[]
  paused: MockTicket[]
}
interface MockCounter {
  id: string
  number: number
  state: string
  operator: { id: string; name: string } | null
  isFree: boolean
}

const ERS = [
  { id: 'er-1', name: 'RE Campinas', isDayOpen: true },
  { id: 'er-2', name: 'RE Curitiba', isDayOpen: false },
]

const OVERVIEW_OPEN: MockOverview = {
  isDayOpen: true,
  waiting: [],
  calling: [],
  inService: [],
  paused: [],
}

const OVERVIEW_CLOSED: MockOverview = { ...OVERVIEW_OPEN, isDayOpen: false }

const COUNTERS_FREE: MockCounter[] = [{ id: 'c-1', number: 1, state: 'UNAVAILABLE', operator: null, isFree: true }]
const COUNTERS_ACTIVE: MockCounter[] = [{ id: 'c-1', number: 1, state: 'ACTIVE', operator: { id: 'op-1', name: 'Operadora 1' }, isFree: false }]
const OPERATORS = [{ id: 'op-1', name: 'Operadora 1', email: 'op1@gb.com.br', hasOpenCounter: false, counterNumber: null }]
const REPS = [{ id: 're-1', fullName: 'RE Um', reCode: 'RE0001', ticket: null }]

function authenticate() {
  seedStaffSession({ id: 'admin-1', name: 'Admin', role: 'ADMIN' })
}

function mockRefreshReturning(overview: MockOverview = OVERVIEW_OPEN, counters: MockCounter[] = COUNTERS_FREE) {
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url.startsWith('/simulation/ers')) return ERS
    if (url.includes('/simulation/state')) return overview
    if (url.includes('/simulation/operators')) return OPERATORS
    if (url.includes('/simulation/counters')) return counters
    if (url.includes('/simulation/representatives')) return REPS
    return []
  })
}

// The page no longer renders a login form: logout, an expired session, or a
// direct visit without a session redirect to the central login at '/'. The stub
// route lets the test observe that redirect.
function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/simulador']}>
      <Routes>
        <Route path="/" element={<div>central-login</div>} />
        <Route path="/simulador" element={<SimuladorPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

// O Toast renderiza a mensagem num <output> (role "status") e codifica o tom só
// pela cor de fundo (sem atributo). Achamos o toast pelo texto e traduzimos a cor
// de volta para o nome do tom, comparando com os tokens — resiliente a mudança de
// valor dos tokens.
const TONE_SOFT: Record<'success' | 'info' | 'error' | 'warning', string> = {
  success: brand.successSoft,
  info: brand.infoSoft,
  error: brand.dangerSoft,
  warning: brand.warningSoft,
}

function hexToRgb(hex: string): string {
  const value = hex.replace('#', '')
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  return `rgb(${r}, ${g}, ${b})`
}

async function findToast(message: string): Promise<HTMLElement> {
  // A mensagem é renderizada dentro do <output> que carrega o estilo de tom. O
  // <output> tem role implícito "status"; subimos até ele (ou usamos o próprio
  // nó casado, que já é o <output>).
  const node = await screen.findByText(message)
  return (node.closest('output') ?? node) as HTMLElement
}

function toneOf(toast: HTMLElement): 'success' | 'info' | 'error' | 'warning' | 'unknown' {
  const background = toast.style.backgroundColor
  for (const [tone, hex] of Object.entries(TONE_SOFT)) {
    if (background === hexToRgb(hex) || background === hex) {
      return tone as 'success' | 'info' | 'error' | 'warning'
    }
  }
  return 'unknown'
}

describe('SimuladorPage', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset()
    vi.mocked(api.post).mockReset()
  })

  describe('authentication gate', () => {
    it('redirects to the central login when not authenticated', () => {
      vi.mocked(api.get).mockResolvedValue([])
      renderPage()
      expect(screen.getByText('central-login')).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Simulador operacional' })).not.toBeInTheDocument()
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

    it('calls open API and shows the success toast with success tone', async () => {
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
      // Sucesso: mensagem afirmativa ("Caixa N aberto") em tom de sucesso, não info.
      const toast = await findToast('Caixa 1 aberto · Operadora 1.')
      expect(toneOf(toast)).toBe('success')
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

    it('shows the reason in info tone when opening fails (no free operator)', async () => {
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
      // opened:false é um "não deu, mas tudo bem": informa o motivo em tom info,
      // nunca em tom de erro/sucesso.
      const toast = await findToast('Sem operadora livre disponível')
      expect(toneOf(toast)).toBe('info')
    })
  })

  describe('day-closed gating', () => {
    // Dois caixas para que "Abrir" (caixa livre) e "Chamar próxima" (caixa ativo)
    // existam ao mesmo tempo; uma RE sem senha rende "Colocar na fila".
    const COUNTERS_FREE_AND_ACTIVE: MockCounter[] = [
      { id: 'c-free', number: 1, state: 'UNAVAILABLE', operator: null, isFree: true },
      { id: 'c-active', number: 2, state: 'ACTIVE', operator: { id: 'op-1', name: 'Operadora 1' }, isFree: false },
    ]

    it('disables Abrir, Chamar próxima and Colocar na fila and shows the hint when the day is closed', async () => {
      authenticate()
      // overview.isDayOpen=false manda em dayOpen mesmo se o ER vier aberto.
      mockRefreshReturning(OVERVIEW_CLOSED, COUNTERS_FREE_AND_ACTIVE)
      renderPage()

      expect(await screen.findByRole('button', { name: 'Abrir' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Chamar próxima' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Colocar na fila' })).toBeDisabled()
      // A dica orienta a abrir o dia no app real antes de simular.
      expect(screen.getByText('Abra a operação do dia no app real antes de simular.')).toBeInTheDocument()
    })

    it('enables those actions and hides the hint when the day is open', async () => {
      authenticate()
      mockRefreshReturning(OVERVIEW_OPEN, COUNTERS_FREE_AND_ACTIVE)
      renderPage()

      expect(await screen.findByRole('button', { name: 'Abrir' })).toBeEnabled()
      expect(screen.getByRole('button', { name: 'Chamar próxima' })).toBeEnabled()
      expect(screen.getByRole('button', { name: 'Colocar na fila' })).toBeEnabled()
      expect(screen.queryByText('Abra a operação do dia no app real antes de simular.')).not.toBeInTheDocument()
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

  describe('ER race condition (currentErRef)', () => {
    // Controla a ordem de resolução das respostas por ER. Cada chamada de api.get
    // com erId fica pendente até liberarmos aquele ER, devolvendo as cargas
    // próprias dele — permitindo a resposta de er-1 chegar DEPOIS da de er-2.
    function controllableByEr() {
      const release: Record<string, () => void> = {}
      const gate: Record<string, Promise<void>> = {}
      for (const id of ['er-1', 'er-2']) {
        gate[id] = new Promise<void>((resolve) => {
          release[id] = resolve
        })
      }

      const payloadFor = (er: string, url: string) => {
        if (url.includes('/simulation/state')) return OVERVIEW_OPEN
        if (url.includes('/simulation/operators')) return OPERATORS
        if (url.includes('/simulation/counters')) {
          // Número do caixa distinto por ER para identificar a origem dos dados.
          return er === 'er-1'
            ? [{ id: 'c-1', number: 1, state: 'UNAVAILABLE', operator: null, isFree: true }]
            : [{ id: 'c-9', number: 9, state: 'UNAVAILABLE', operator: null, isFree: true }]
        }
        if (url.includes('/simulation/representatives')) {
          return er === 'er-1'
            ? [{ id: 're-1', fullName: 'RE Um', reCode: 'RE0001', ticket: null }]
            : [{ id: 're-9', fullName: 'RE Nove', reCode: 'RE0009', ticket: null }]
        }
        return []
      }

      vi.mocked(api.get).mockImplementation(async (url: string) => {
        // Lista de ERs (mount) resolve de imediato — não pertence a nenhum ER.
        if (url.startsWith('/simulation/ers')) return ERS as never
        const er = url.includes('erId=er-2') ? 'er-2' : 'er-1'
        await gate[er]
        return payloadFor(er, url) as never
      })

      return { release }
    }

    it('discards the late response of a previous ER after switching ERs', async () => {
      authenticate()
      const { release } = controllableByEr()
      renderPage()

      // Mount auto-seleciona er-1 e dispara refresh(er-1), que fica pendente.
      const select = await screen.findByLabelText('ER ativo')
      // Troca para er-2 antes de er-1 resolver: currentErRef passa a apontar er-2.
      await userEvent.selectOptions(select, 'er-2')

      // er-2 resolve primeiro e aplica seus dados (Caixa 9 / RE0009).
      release['er-2']()
      expect(await screen.findByText('Caixa 9')).toBeInTheDocument()
      expect(screen.getByText('RE0009')).toBeInTheDocument()

      // er-1 resolve DEPOIS: como o ref aponta er-2, a resposta tardia é descartada.
      release['er-1']()
      await waitFor(() => expect(api.get).toHaveBeenCalledWith('/simulation/counters?erId=er-1'))

      // A tela continua mostrando er-2; nada de er-1 vaza.
      expect(screen.getByText('Caixa 9')).toBeInTheDocument()
      expect(screen.getByText('RE0009')).toBeInTheDocument()
      expect(screen.queryByText('Caixa 1')).not.toBeInTheDocument()
      expect(screen.queryByText('RE0001')).not.toBeInTheDocument()
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
