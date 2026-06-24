import { ForbiddenException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { EntryChannel, Role, TicketState } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { MetricsService } from '../metrics.service'

function makeTicket(
  overrides: Partial<{
    id: string
    state: TicketState
    entryChannel: EntryChannel
    createdAt: Date
  }> = {},
) {
  return {
    id: 'tk-1',
    state: TicketState.FINISHED,
    entryChannel: EntryChannel.QR_CODE,
    createdAt: new Date('2026-06-10T12:00:00Z'),
    ...overrides,
  }
}

function makeEvent(
  eventType: string,
  createdAt: string,
  ticketId = 'tk-1',
  entryChannel: EntryChannel = EntryChannel.QR_CODE,
  options: {
    operatorId?: string
    operatorName?: string
    metadata?: Record<string, unknown>
  } = {},
) {
  return {
    eventType,
    ticketId,
    operatorId: options.operatorId ?? null,
    operator: options.operatorId
      ? { id: options.operatorId, name: options.operatorName ?? options.operatorId }
      : null,
    metadata: options.metadata ?? null,
    createdAt: new Date(createdAt),
    ticket: { entryChannel },
  }
}

const mockPrisma = {
  ticket: { findMany: jest.fn(), count: jest.fn() },
  auditEvent: { findMany: jest.fn() },
  counter: { findMany: jest.fn() },
}
const manager = { userId: 'mgr-1', role: Role.MANAGER, erId: 'er-1' }

describe('MetricsService', () => {
  let service: MetricsService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MetricsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile()

    service = module.get<MetricsService>(MetricsService)
    jest.clearAllMocks()
    mockPrisma.ticket.findMany.mockResolvedValue([])
    mockPrisma.ticket.count.mockResolvedValue(0)
    mockPrisma.auditEvent.findMany.mockResolvedValue([])
    mockPrisma.counter.findMany.mockResolvedValue([])
  })

  // Rede de segurança: restaura o relógio real após cada teste, mesmo se um teste
  // com fake timers falhar antes do seu próprio useRealTimers — evita vazar timers
  // para os testes seguintes.
  afterEach(() => {
    jest.useRealTimers()
  })

  it('returns zeros when the daily queue and audit are empty', async () => {
    const result = await service.getDailyMetrics('er-1', manager)

    expect(result.totalCreated).toBe(0)
    expect(result.avgWaitSeconds).toBe(0)
    expect(result.avgServiceSeconds).toBe(0)
    expect(result.totalNoShow).toBe(0)
  })

  it('calculates wait, service and hourly volume from audit events', async () => {
    mockPrisma.ticket.findMany.mockResolvedValue([makeTicket()])
    mockPrisma.auditEvent.findMany.mockResolvedValue([
      makeEvent('ticket_created', '2026-06-10T12:00:00Z'),
      makeEvent('ticket_called', '2026-06-10T12:08:00Z', 'tk-1', EntryChannel.QR_CODE, {
        operatorId: 'op-1',
        operatorName: 'Ana',
        metadata: { counterId: 'counter-1' },
      }),
      makeEvent('service_started', '2026-06-10T12:10:00Z'),
      makeEvent('service_finished', '2026-06-10T12:15:00Z', 'tk-1', EntryChannel.QR_CODE, {
        operatorId: 'op-1',
        operatorName: 'Ana',
        metadata: { counterId: 'counter-1' },
      }),
    ])
    mockPrisma.counter.findMany.mockResolvedValue([{ id: 'counter-1', number: 1, state: 'ACTIVE' }])

    const result = await service.getDailyMetrics('er-1', manager)

    expect(result.avgWaitSeconds).toBe(600)
    expect(result.medianWaitSeconds).toBe(600)
    expect(result.avgServiceSeconds).toBe(300)
    expect(result.avgCallToStartSeconds).toBe(120)
    expect(result.totalFinished).toBe(1)
    expect(result.volumeByHour[9]).toBe(1)
    expect(result.serviceByCounter['Caixa 1']).toBe(1)
    expect(result.serviceByOperator.Ana).toBe(1)
    expect(result.callsByOperator.Ana).toBe(1)
  })

  it('keeps no-show history and restarts wait time after restoration', async () => {
    mockPrisma.ticket.findMany.mockResolvedValue([
      makeTicket({ state: TicketState.FINISHED, entryChannel: EntryChannel.LINK }),
    ])
    mockPrisma.auditEvent.findMany.mockResolvedValue([
      makeEvent('ticket_created', '2026-06-10T12:00:00Z', 'tk-1', EntryChannel.LINK),
      makeEvent('ticket_no_show', '2026-06-10T12:05:00Z', 'tk-1', EntryChannel.LINK),
      makeEvent('ticket_restored', '2026-06-10T12:20:00Z', 'tk-1', EntryChannel.LINK),
      makeEvent('service_started', '2026-06-10T12:30:00Z', 'tk-1', EntryChannel.LINK),
      makeEvent('service_finished', '2026-06-10T12:35:00Z', 'tk-1', EntryChannel.LINK),
    ])

    const result = await service.getDailyMetrics('er-1', manager)

    expect(result.totalNoShow).toBe(1)
    expect(result.noShowByChannel.LINK).toBe(1)
    expect(result.avgWaitSeconds).toBe(600)
    expect(result.totalRestored).toBe(1)
  })

  it('counts wait only once when a ticket is paused mid-service and re-served', async () => {
    mockPrisma.ticket.findMany.mockResolvedValue([makeTicket()])
    mockPrisma.auditEvent.findMany.mockResolvedValue([
      makeEvent('ticket_created', '2026-06-10T12:00:00Z'),
      makeEvent('ticket_called', '2026-06-10T12:08:00Z'),
      makeEvent('service_started', '2026-06-10T12:10:00Z'),
      // Pausada em atendimento e retomada (volta ao fim da fila) → nova chamada/atendimento.
      makeEvent('ticket_resumed', '2026-06-10T12:13:00Z'),
      makeEvent('ticket_called', '2026-06-10T12:20:00Z'),
      makeEvent('service_started', '2026-06-10T12:30:00Z'),
      makeEvent('service_finished', '2026-06-10T12:35:00Z'),
    ])

    const result = await service.getDailyMetrics('er-1', manager)

    // Só UMA amostra de espera, a do 1º atendimento (600s). Sem a 2ª amostra
    // inflada (1800s desde a criação) que dobraria a média.
    expect(result.avgWaitSeconds).toBe(600)
    expect(result.medianWaitSeconds).toBe(600)
  })

  it('counts cancellations and no-shows independently by entry channel', async () => {
    mockPrisma.ticket.findMany.mockResolvedValue([
      makeTicket({ id: 'qr', entryChannel: EntryChannel.QR_CODE }),
      makeTicket({ id: 'link', entryChannel: EntryChannel.LINK }),
      makeTicket({ id: 'assisted', entryChannel: EntryChannel.CHECKIN_ASSISTED }),
    ])
    mockPrisma.auditEvent.findMany.mockResolvedValue([
      makeEvent('ticket_cancelled', '2026-06-10T12:00:00Z', 'qr', EntryChannel.QR_CODE),
      makeEvent('ticket_no_show', '2026-06-10T12:01:00Z', 'link', EntryChannel.LINK),
      makeEvent(
        'ticket_no_show',
        '2026-06-10T12:02:00Z',
        'assisted',
        EntryChannel.CHECKIN_ASSISTED,
      ),
    ])

    const result = await service.getDailyMetrics('er-1', manager)

    expect(result.totalCancelled).toBe(1)
    expect(result.cancelledByChannel.QR_CODE).toBe(1)
    expect(result.totalNoShow).toBe(2)
    expect(result.noShowByChannel.LINK).toBe(1)
    expect(result.noShowByChannel.CHECKIN_ASSISTED).toBe(1)
  })

  it('counts tickets created today by entry channel', async () => {
    mockPrisma.ticket.findMany.mockResolvedValue([
      makeTicket({ id: 'qr-1', entryChannel: EntryChannel.QR_CODE }),
      makeTicket({ id: 'qr-2', entryChannel: EntryChannel.QR_CODE }),
      makeTicket({ id: 'link', entryChannel: EntryChannel.LINK }),
    ])
    mockPrisma.auditEvent.findMany.mockResolvedValue([
      makeEvent('ticket_created', '2026-06-10T12:00:00Z', 'qr-1'),
      makeEvent('ticket_created', '2026-06-10T12:01:00Z', 'qr-2'),
      makeEvent('ticket_created', '2026-06-10T12:02:00Z', 'link', EntryChannel.LINK),
    ])

    const result = await service.getDailyMetrics('er-1', manager)

    expect(result.totalCreated).toBe(3)
    expect(result.byChannel.QR_CODE).toBe(2)
    expect(result.byChannel.LINK).toBe(1)
    expect(result.byChannel.CHECKIN_ASSISTED).toBe(0)
  })

  it('does not count a restored older ticket as newly created today', async () => {
    mockPrisma.ticket.findMany.mockResolvedValue([
      makeTicket({ state: TicketState.WAITING, entryChannel: EntryChannel.LINK }),
    ])
    mockPrisma.auditEvent.findMany.mockResolvedValue([
      makeEvent('ticket_restored', '2026-06-10T12:00:00Z', 'tk-1', EntryChannel.LINK),
    ])

    const result = await service.getDailyMetrics('er-1', manager)

    expect(result.totalCreated).toBe(0)
    expect(result.totalRestored).toBe(1)
    expect(result.byChannel.LINK).toBe(0)
  })

  it('counts auto no-shows (call timeout) as no-show', async () => {
    mockPrisma.ticket.findMany.mockResolvedValue([
      makeTicket({ state: TicketState.NO_SHOW, entryChannel: EntryChannel.QR_CODE }),
    ])
    mockPrisma.auditEvent.findMany.mockResolvedValue([
      makeEvent('ticket_auto_no_show', '2026-06-10T12:05:00Z', 'tk-1', EntryChannel.QR_CODE),
    ])

    const result = await service.getDailyMetrics('er-1', manager)

    expect(result.totalNoShow).toBe(1)
    expect(result.noShowByChannel.QR_CODE).toBe(1)
  })

  it('counts duplicate attempts and pause duration per counter', async () => {
    mockPrisma.counter.findMany.mockResolvedValue([{ id: 'counter-1', number: 1, state: 'ACTIVE' }])
    mockPrisma.auditEvent.findMany.mockResolvedValue([
      makeEvent('duplicate_ticket_blocked', '2026-06-10T12:00:00Z'),
      makeEvent(
        'counter_paused',
        '2026-06-10T12:10:00Z',
        null as unknown as string,
        EntryChannel.QR_CODE,
        {
          metadata: { counterId: 'counter-1' },
        },
      ),
      makeEvent(
        'counter_resumed',
        '2026-06-10T12:15:00Z',
        null as unknown as string,
        EntryChannel.QR_CODE,
        {
          metadata: { counterId: 'counter-1' },
        },
      ),
    ])

    const result = await service.getDailyMetrics('er-1', manager)

    expect(result.duplicateAttempts).toBe(1)
    expect(result.pauseSecondsByCounter['Caixa 1']).toBe(300)
  })

  it('rejects non-manager, non-admin roles', async () => {
    await expect(
      service.getDailyMetrics('er-1', { userId: 'rep-1', role: Role.REPRESENTATIVE, erId: 'er-1' }),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('rejects a manager reading metrics from another ER', async () => {
    await expect(
      service.getDailyMetrics('er-2', { userId: 'mgr-1', role: Role.MANAGER, erId: 'er-1' }),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('rejects a manager with no ER assigned', async () => {
    await expect(
      service.getDailyMetrics('er-1', { userId: 'mgr-1', role: Role.MANAGER, erId: undefined }),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('allows an admin to read any ER without an erId of their own', async () => {
    const result = await service.getDailyMetrics('er-9', {
      userId: 'admin-1',
      role: Role.ADMIN,
      erId: undefined,
    })

    expect(result.totalCreated).toBe(0)
  })

  it('falls back to ticket.createdAt for the max current wait of a waiting ticket', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-10T12:10:00Z'))
    mockPrisma.ticket.findMany.mockResolvedValue([
      makeTicket({
        id: 'waiting-1',
        state: TicketState.WAITING,
        createdAt: new Date('2026-06-10T12:00:00Z'),
      }),
    ])
    // No ticket_created event, so waitingSince has no entry and the `?? createdAt` runs.
    mockPrisma.auditEvent.findMany.mockResolvedValue([])

    const result = await service.getDailyMetrics('er-1', manager)

    expect(result.maxCurrentWaitSeconds).toBe(600)
    jest.useRealTimers()
  })

  it('ignores created events whose ticket relation is missing', async () => {
    const orphan = { ...makeEvent('ticket_created', '2026-06-10T12:00:00Z'), ticket: null }
    mockPrisma.auditEvent.findMany.mockResolvedValue([orphan])

    const result = await service.getDailyMetrics('er-1', manager)

    expect(result.totalCreated).toBe(1)
    expect(result.byChannel.QR_CODE).toBe(0)
    expect(result.byChannel.LINK).toBe(0)
  })

  it('ignores cancelled and no-show events whose ticket relation is missing', async () => {
    const cancelled = { ...makeEvent('ticket_cancelled', '2026-06-10T12:00:00Z'), ticket: null }
    const noShow = { ...makeEvent('ticket_no_show', '2026-06-10T12:01:00Z'), ticket: null }
    mockPrisma.auditEvent.findMany.mockResolvedValue([cancelled, noShow])

    const result = await service.getDailyMetrics('er-1', manager)

    expect(result.totalCancelled).toBe(1)
    expect(result.totalNoShow).toBe(1)
    expect(result.cancelledByChannel.QR_CODE).toBe(0)
    expect(result.noShowByChannel.QR_CODE).toBe(0)
  })

  it('does not accumulate wait or service samples without their starting events', async () => {
    mockPrisma.ticket.findMany.mockResolvedValue([makeTicket()])
    mockPrisma.auditEvent.findMany.mockResolvedValue([
      // service_started without a preceding ticket_created/restored -> no wait sample
      makeEvent('service_started', '2026-06-10T12:10:00Z'),
      // service_finished without a preceding service_started -> no service sample
      makeEvent('service_finished', '2026-06-10T13:00:00Z', 'tk-2'),
    ])

    const result = await service.getDailyMetrics('er-1', manager)

    expect(result.avgWaitSeconds).toBe(0)
    expect(result.avgServiceSeconds).toBe(0)
    expect(result.totalFinished).toBe(1)
  })

  it('averages the two middle samples for an even-sized median', async () => {
    mockPrisma.ticket.findMany.mockResolvedValue([
      makeTicket({ id: 'tk-1' }),
      makeTicket({ id: 'tk-2' }),
    ])
    mockPrisma.auditEvent.findMany.mockResolvedValue([
      // tk-1: 2 min wait, 4 min service
      makeEvent('ticket_created', '2026-06-10T12:00:00Z', 'tk-1'),
      makeEvent('service_started', '2026-06-10T12:02:00Z', 'tk-1'),
      makeEvent('service_finished', '2026-06-10T12:06:00Z', 'tk-1'),
      // tk-2: 4 min wait, 6 min service
      makeEvent('ticket_created', '2026-06-10T12:00:00Z', 'tk-2'),
      makeEvent('service_started', '2026-06-10T12:04:00Z', 'tk-2'),
      makeEvent('service_finished', '2026-06-10T12:10:00Z', 'tk-2'),
    ])

    const result = await service.getDailyMetrics('er-1', manager)

    // two wait samples (120s, 240s) -> median averages the pair -> 180s
    expect(result.medianWaitSeconds).toBe(180)
    // two service samples (240s, 360s) -> median 300s
    expect(result.medianServiceSeconds).toBe(300)
  })

  it('labels service-by-counter with the raw id when the counter is unknown', async () => {
    // No counters returned, so counterNames has no entry for counter-x.
    mockPrisma.counter.findMany.mockResolvedValue([])
    mockPrisma.auditEvent.findMany.mockResolvedValue([
      makeEvent('ticket_created', '2026-06-10T12:00:00Z'),
      makeEvent('service_started', '2026-06-10T12:02:00Z'),
      makeEvent('service_finished', '2026-06-10T12:06:00Z', 'tk-1', EntryChannel.QR_CODE, {
        metadata: { counterId: 'counter-x' },
      }),
    ])

    const result = await service.getDailyMetrics('er-1', manager)

    expect(result.serviceByCounter['counter-x']).toBe(1)
    expect(result.serviceByCounter['Caixa 1']).toBeUndefined()
  })

  it('ignores non-string metadata values when grouping by counter', async () => {
    mockPrisma.counter.findMany.mockResolvedValue([{ id: 'counter-1', number: 1, state: 'ACTIVE' }])
    mockPrisma.auditEvent.findMany.mockResolvedValue([
      makeEvent('ticket_created', '2026-06-10T12:00:00Z'),
      makeEvent('service_started', '2026-06-10T12:02:00Z'),
      makeEvent('service_finished', '2026-06-10T12:06:00Z', 'tk-1', EntryChannel.QR_CODE, {
        metadata: { counterId: 42 as unknown as string },
      }),
    ])

    const result = await service.getDailyMetrics('er-1', manager)

    expect(result.serviceByCounter).toEqual({})
  })

  it('ignores pause events without a counterId in metadata', async () => {
    mockPrisma.counter.findMany.mockResolvedValue([{ id: 'counter-1', number: 1, state: 'ACTIVE' }])
    mockPrisma.auditEvent.findMany.mockResolvedValue([
      makeEvent('counter_paused', '2026-06-10T12:10:00Z', null as unknown as string),
      makeEvent('counter_resumed', '2026-06-10T12:15:00Z', null as unknown as string),
    ])

    const result = await service.getDailyMetrics('er-1', manager)

    expect(result.pauseSecondsByCounter).toEqual({})
  })

  it('ignores a counter_resumed without a matching counter_paused', async () => {
    mockPrisma.counter.findMany.mockResolvedValue([{ id: 'counter-1', number: 1, state: 'ACTIVE' }])
    mockPrisma.auditEvent.findMany.mockResolvedValue([
      makeEvent('counter_resumed', '2026-06-10T12:15:00Z', null as unknown as string, EntryChannel.QR_CODE, {
        metadata: { counterId: 'counter-1' },
      }),
    ])

    const result = await service.getDailyMetrics('er-1', manager)

    expect(result.pauseSecondsByCounter).toEqual({})
  })

  it('flushes an unresolved pause up to the end of the business day', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-11T12:00:00Z'))
    mockPrisma.counter.findMany.mockResolvedValue([{ id: 'counter-1', number: 1, state: 'PAUSED' }])
    mockPrisma.auditEvent.findMany.mockResolvedValue([
      makeEvent('counter_paused', '2026-06-10T12:10:00Z', null as unknown as string, EntryChannel.QR_CODE, {
        metadata: { counterId: 'counter-1' },
      }),
    ])

    const result = await service.getDailyMetrics('er-1', manager)

    // The pause stays open, so it is charged from 12:10 to the business-day end.
    expect(result.pauseSecondsByCounter['Caixa 1']).toBeGreaterThan(0)
    jest.useRealTimers()
  })

  it('reports every tied hour as a peak, not just one', async () => {
    mockPrisma.ticket.findMany.mockResolvedValue([
      makeTicket({ id: 'tk-1' }),
      makeTicket({ id: 'tk-2' }),
      makeTicket({ id: 'tk-3' }),
      makeTicket({ id: 'tk-4' }),
    ])
    mockPrisma.auditEvent.findMany.mockResolvedValue([
      // Two finishes in local hour 9 (12:xx UTC = 09:xx BRT).
      makeEvent('service_finished', '2026-06-10T12:15:00Z', 'tk-1'),
      makeEvent('service_finished', '2026-06-10T12:45:00Z', 'tk-2'),
      // Two finishes in local hour 11 (14:xx UTC = 11:xx BRT) -> ties hour 9.
      makeEvent('service_finished', '2026-06-10T14:15:00Z', 'tk-3'),
      makeEvent('service_finished', '2026-06-10T14:45:00Z', 'tk-4'),
    ])

    const result = await service.getDailyMetrics('er-1', manager)

    expect(result.volumeByHour[9]).toBe(2)
    expect(result.volumeByHour[11]).toBe(2)
    // The tie must surface BOTH peak hours, not collapse to a single winner.
    expect([...result.peakHours].sort((a, b) => a - b)).toEqual([9, 11])
  })

  it('maps the average wait per local business hour', async () => {
    mockPrisma.ticket.findMany.mockResolvedValue([
      makeTicket({ id: 'tk-1' }),
      makeTicket({ id: 'tk-2' }),
      makeTicket({ id: 'tk-3' }),
    ])
    mockPrisma.auditEvent.findMany.mockResolvedValue([
      // tk-1 + tk-2 wait in local hour 9 (service_started at 12:xx UTC = 09:xx BRT).
      // Waits of 120s and 240s -> average 180s for hour 9.
      makeEvent('ticket_created', '2026-06-10T12:00:00Z', 'tk-1'),
      makeEvent('service_started', '2026-06-10T12:02:00Z', 'tk-1'),
      makeEvent('ticket_created', '2026-06-10T12:00:00Z', 'tk-2'),
      makeEvent('service_started', '2026-06-10T12:04:00Z', 'tk-2'),
      // tk-3 waits in local hour 11 (service_started at 14:xx UTC = 11:xx BRT) -> 600s.
      makeEvent('ticket_created', '2026-06-10T14:00:00Z', 'tk-3'),
      makeEvent('service_started', '2026-06-10T14:10:00Z', 'tk-3'),
    ])

    const result = await service.getDailyMetrics('er-1', manager)

    expect(result.waitSecondsByHour[9]).toBe(180)
    expect(result.waitSecondsByHour[11]).toBe(600)
  })

  it('buckets an event by its local hour across a UTC day boundary', async () => {
    // 02:00Z falls on 23:00 of the PREVIOUS local day in America/Sao_Paulo (UTC-3).
    // The finish must be counted in local hour 23, never in UTC hour 2.
    mockPrisma.ticket.findMany.mockResolvedValue([makeTicket({ id: 'tk-1' })])
    mockPrisma.auditEvent.findMany.mockResolvedValue([
      makeEvent('ticket_created', '2026-06-23T01:50:00Z', 'tk-1'),
      makeEvent('service_started', '2026-06-23T01:55:00Z', 'tk-1'),
      makeEvent('service_finished', '2026-06-23T02:00:00Z', 'tk-1'),
    ])

    const result = await service.getDailyMetrics('er-1', manager)

    expect(result.volumeByHour[23]).toBe(1)
    expect(result.volumeByHour[2]).toBeUndefined()
    // The matching wait sample (started 01:55Z = 22:55 BRT) lands in local hour 22.
    expect(result.waitSecondsByHour[22]).toBe(300)
  })

  it('returns 0 for the missing metric when only service samples exist', async () => {
    mockPrisma.ticket.findMany.mockResolvedValue([makeTicket({ id: 'tk-1' })])
    mockPrisma.auditEvent.findMany.mockResolvedValue([
      // service_started with no preceding ticket_created -> no wait sample at all,
      // but a complete service flow -> one service sample (300s).
      makeEvent('service_started', '2026-06-10T12:10:00Z', 'tk-1'),
      makeEvent('service_finished', '2026-06-10T12:15:00Z', 'tk-1'),
    ])

    const result = await service.getDailyMetrics('er-1', manager)

    // No wait samples -> _average/_median must yield 0 without dividing by zero.
    expect(result.avgWaitSeconds).toBe(0)
    expect(result.medianWaitSeconds).toBe(0)
    expect(result.waitSecondsByHour).toEqual({})
    // Service side still computes normally.
    expect(result.avgServiceSeconds).toBe(300)
    expect(result.medianServiceSeconds).toBe(300)
  })

  it('returns 0 for the missing metric when only wait samples exist', async () => {
    mockPrisma.ticket.findMany.mockResolvedValue([makeTicket({ id: 'tk-1' })])
    mockPrisma.auditEvent.findMany.mockResolvedValue([
      // Wait sample exists (600s) but service never finishes -> no service sample.
      makeEvent('ticket_created', '2026-06-10T12:00:00Z', 'tk-1'),
      makeEvent('service_started', '2026-06-10T12:10:00Z', 'tk-1'),
    ])

    const result = await service.getDailyMetrics('er-1', manager)

    expect(result.avgWaitSeconds).toBe(600)
    expect(result.medianWaitSeconds).toBe(600)
    // No service samples -> _average/_median must yield 0, not NaN.
    expect(result.avgServiceSeconds).toBe(0)
    expect(result.medianServiceSeconds).toBe(0)
  })
})
