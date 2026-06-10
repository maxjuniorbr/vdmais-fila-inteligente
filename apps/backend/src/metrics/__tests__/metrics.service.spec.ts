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
})
