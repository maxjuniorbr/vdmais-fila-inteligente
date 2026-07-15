import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { CounterState, Role, TicketState } from '@prisma/client'
import { PanelGateway } from '../../panel/panel.gateway'
import { PrismaService } from '../../prisma/prisma.service'
import { ERService } from '../er.service'

const manager = { userId: 'manager-1', role: Role.MANAGER, erId: 'er-1' }
const tx = {
  $queryRaw: jest.fn(),
  eR: { findUnique: jest.fn(), update: jest.fn() },
  queue: { findUnique: jest.fn(), updateMany: jest.fn(), upsert: jest.fn() },
  ticket: { count: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
  counter: { updateMany: jest.fn() },
  auditEvent: { create: jest.fn(), createMany: jest.fn() },
}
const prisma = {
  $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  eR: { findUnique: jest.fn() },
}
const panel = { emitToER: jest.fn() }

describe('ERService', () => {
  let service: ERService

  beforeEach(() => {
    jest.resetAllMocks()
    prisma.$transaction.mockImplementation((callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    )
    service = new ERService(prisma as unknown as PrismaService, panel as unknown as PanelGateway)
    tx.eR.findUnique.mockResolvedValue({ id: 'er-1', isDayOpen: true })
    tx.eR.update.mockResolvedValue({ id: 'er-1', isDayOpen: false })
    tx.ticket.count.mockResolvedValue(0)
    tx.ticket.findMany.mockResolvedValue([])
    tx.ticket.updateMany.mockResolvedValue({ count: 0 })
    tx.counter.updateMany.mockResolvedValue({ count: 0 })
    tx.queue.findUnique.mockResolvedValue(null)
    tx.queue.upsert.mockResolvedValue({ id: 'queue-1' })
    tx.auditEvent.create.mockResolvedValue({})
    tx.auditEvent.createMany.mockResolvedValue({ count: 0 })
  })

  it('blocks day closing while a ticket is waiting, calling, or paused', async () => {
    tx.ticket.count.mockResolvedValue(1)

    await expect(service.closeDay('er-1', manager)).rejects.toThrow(ConflictException)

    expect(tx.ticket.count).toHaveBeenCalledWith({
      where: {
        erId: 'er-1',
        queue: { businessDate: expect.any(Date) },
        state: {
          in: [TicketState.WAITING, TicketState.CALLING, TicketState.PAUSED],
        },
      },
    })
    expect(tx.eR.update).not.toHaveBeenCalled()
  })

  it('closes the day when only already-started services may remain', async () => {
    const result = await service.closeDay('er-1', manager)

    expect(result.isDayOpen).toBe(false)
    // O fechamento marca closedAt apenas nas filas do ER/dia ainda abertas
    // (closedAt: null) — não reabre nem rebate filas já fechadas.
    expect(tx.queue.updateMany).toHaveBeenCalledWith({
      where: { erId: 'er-1', businessDate: expect.any(Date), closedAt: null },
      data: { closedAt: expect.any(Date) },
    })
    expect(panel.emitToER).toHaveBeenCalledWith(
      'er-1',
      'day.closed',
      expect.objectContaining({ closedAt: expect.any(Date) }),
    )
  })

  it('does not block closing on IN_SERVICE tickets and auto-finishes them', async () => {
    // Comportamento INTENCIONAL: a contagem de bloqueio considera apenas
    // WAITING/CALLING/PAUSED. Senhas IN_SERVICE NÃO impedem o fechamento — são
    // auto-finalizadas (service_force_finished) para não ficarem órfãs e para
    // preservarem os números de atendimentos concluídos.
    tx.ticket.count.mockResolvedValue(0)
    tx.ticket.findMany.mockResolvedValue([{ id: 'svc-9', counterId: 'c9' }])
    tx.ticket.updateMany.mockResolvedValue({ count: 1 })

    const result = await service.closeDay('er-1', manager)

    // O dia FECHA mesmo com IN_SERVICE presente (sem ConflictException).
    expect(result.isDayOpen).toBe(false)
    expect(tx.eR.update).toHaveBeenCalledWith({
      where: { id: 'er-1' },
      data: { isDayOpen: false, dayClosedAt: expect.any(Date) },
    })
    // A contagem de bloqueio não inclui IN_SERVICE.
    expect(tx.ticket.count).toHaveBeenCalledWith({
      where: {
        erId: 'er-1',
        queue: { businessDate: expect.any(Date) },
        state: {
          in: [TicketState.WAITING, TicketState.CALLING, TicketState.PAUSED],
        },
      },
    })
    // E o IN_SERVICE remanescente é auto-finalizado.
    expect(tx.ticket.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['svc-9'] } },
      data: { state: TicketState.FINISHED, serviceFinishedAt: expect.any(Date) },
    })
    expect(tx.auditEvent.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ eventType: 'service_force_finished', ticketId: 'svc-9' })],
    })
  })

  it('auto-finishes in-service tickets and releases their counter when closing the day', async () => {
    tx.ticket.count.mockResolvedValue(0)
    tx.ticket.findMany.mockResolvedValue([{ id: 'svc-1', counterId: 'c1' }])
    tx.ticket.updateMany.mockResolvedValue({ count: 1 })
    tx.counter.updateMany.mockResolvedValue({ count: 1 })

    await service.closeDay('er-1', manager)

    expect(tx.ticket.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['svc-1'] } },
      data: { state: TicketState.FINISHED, serviceFinishedAt: expect.any(Date) },
    })
    expect(tx.auditEvent.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ eventType: 'service_force_finished', ticketId: 'svc-1' })],
    })
    // The most common close path: the operator was still mid-service at a
    // counter. Finishing the ticket must also free that counter (no caixa left
    // "open" after the day closes).
    expect(tx.counter.updateMany).toHaveBeenCalledWith({
      where: { erId: 'er-1', state: { not: CounterState.UNAVAILABLE } },
      data: { state: CounterState.UNAVAILABLE, operatorId: null },
    })
  })

  it('blocks day closing when the day is already closed', async () => {
    tx.eR.findUnique.mockResolvedValue({ id: 'er-1', isDayOpen: false })

    await expect(service.closeDay('er-1', manager)).rejects.toThrow(ConflictException)

    expect(tx.ticket.count).not.toHaveBeenCalled()
    expect(tx.eR.update).not.toHaveBeenCalled()
  })

  it('fails to close the day when the ER no longer exists', async () => {
    tx.eR.findUnique.mockResolvedValue(null)

    await expect(service.closeDay('er-1', manager)).rejects.toThrow(NotFoundException)

    expect(tx.eR.update).not.toHaveBeenCalled()
  })

  it('releases all counters and finishes in-service tickets when closing the day', async () => {
    tx.ticket.count.mockResolvedValue(0)
    tx.ticket.findMany.mockResolvedValue([{ id: 'svc-1', counterId: null }])
    tx.ticket.updateMany.mockResolvedValue({ count: 1 })
    tx.counter.updateMany.mockResolvedValue({ count: 2 })

    await service.closeDay('er-1', manager)

    expect(tx.ticket.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['svc-1'] } },
      data: { state: TicketState.FINISHED, serviceFinishedAt: expect.any(Date) },
    })
    // Closing the day frees every open counter (UNAVAILABLE + no operator), the
    // same reset the next openDay applies — so no counter is left "open".
    expect(tx.counter.updateMany).toHaveBeenCalledWith({
      where: { erId: 'er-1', state: { not: CounterState.UNAVAILABLE } },
      data: { state: CounterState.UNAVAILABLE, operatorId: null },
    })
    expect(tx.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ eventType: 'counters_reset_for_day', erId: 'er-1' }),
    })
  })

  it('fails to open the day when the ER no longer exists', async () => {
    tx.eR.findUnique.mockResolvedValue(null)

    await expect(service.openDay('er-1', manager)).rejects.toThrow(NotFoundException)

    expect(tx.eR.update).not.toHaveBeenCalled()
  })

  it('finds an ER by id for staff access', async () => {
    prisma.eR.findUnique.mockResolvedValue({ id: 'er-1', isDayOpen: true })

    await expect(service.getForStaff('er-1', manager)).resolves.toEqual({
      id: 'er-1',
      isDayOpen: true,
      hasPanelToken: false,
    })
    expect(prisma.eR.findUnique).toHaveBeenCalledWith({ where: { id: 'er-1' } })
  })

  it('never leaks the panel token hash to staff, only whether one exists', async () => {
    prisma.eR.findUnique.mockResolvedValue({
      id: 'er-1',
      isDayOpen: true,
      panelTokenHash: 'super-secret-hash',
    })

    const result = await service.getForStaff('er-1', manager)

    expect(result).not.toHaveProperty('panelTokenHash')
    expect(result).toMatchObject({ hasPanelToken: true })
  })

  it('throws when an ER is not found by id', async () => {
    prisma.eR.findUnique.mockResolvedValue(null)

    await expect(service.findById('er-1')).rejects.toThrow(NotFoundException)
  })

  it('throws when a public ER is not found', async () => {
    prisma.eR.findUnique.mockResolvedValue(null)

    await expect(service.getPublic('er-1')).rejects.toThrow(NotFoundException)
  })

  it('allows an admin to manage any ER', async () => {
    const admin = { userId: 'admin-1', role: Role.ADMIN, erId: undefined }
    prisma.eR.findUnique.mockResolvedValue({ id: 'er-2', isDayOpen: true })

    await expect(service.getForStaff('er-2', admin)).resolves.toEqual({
      id: 'er-2',
      isDayOpen: true,
      hasPanelToken: false,
    })
  })

  it('forbids a manager from managing a different ER', async () => {
    const otherManager = { userId: 'manager-2', role: Role.MANAGER, erId: 'er-9' }

    expect(() => service.getForStaff('er-1', otherManager)).toThrow(ForbiddenException)
    expect(prisma.eR.findUnique).not.toHaveBeenCalled()
  })

  it('forbids a manager without an assigned ER', async () => {
    const unassignedManager = { userId: 'manager-3', role: Role.MANAGER, erId: undefined }

    expect(() => service.getForStaff('er-1', unassignedManager)).toThrow(ForbiddenException)
  })

  it('forbids a non-manager non-admin role from managing an ER', async () => {
    const operator = { userId: 'op-1', role: Role.OPERATOR, erId: 'er-1' }

    expect(() => service.getForStaff('er-1', operator)).toThrow(ForbiddenException)
  })

  it('returns only public ER identification and operation status', async () => {
    prisma.eR.findUnique.mockResolvedValue({
      id: 'er-1',
      name: 'ER Centro',
      isDayOpen: true,
      guestEntryEnabled: false,
    })

    await expect(service.getPublic('er-1')).resolves.toEqual({
      id: 'er-1',
      name: 'ER Centro',
      isDayOpen: true,
      guestEntryEnabled: false,
    })
    expect(prisma.eR.findUnique).toHaveBeenCalledWith({
      where: { id: 'er-1' },
      select: { id: true, name: true, isDayOpen: true, guestEntryEnabled: true },
    })
  })

  describe('openDay', () => {
    it('opens the day and creates the daily queue when there are no leftovers', async () => {
      tx.eR.findUnique.mockResolvedValue({ id: 'er-1', isDayOpen: false })
      tx.eR.update.mockResolvedValue({ id: 'er-1', isDayOpen: true })

      const result = await service.openDay('er-1', manager)

      expect(result.isDayOpen).toBe(true)
      expect(tx.ticket.updateMany).not.toHaveBeenCalled()
      // O upsert da fila do dia: cria a fila já aberta (openedAt) ou reabre uma
      // fila existente do mesmo businessDate, sempre limpando closedAt.
      expect(tx.queue.upsert).toHaveBeenCalledWith({
        where: { erId_businessDate: { erId: 'er-1', businessDate: expect.any(Date) } },
        create: { erId: 'er-1', businessDate: expect.any(Date), openedAt: expect.any(Date) },
        update: { openedAt: expect.any(Date), closedAt: null },
      })
      expect(tx.auditEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: 'daily_queue_opened',
          metadata: { forcedClosedCount: 0, releasedCounters: 0 },
        }),
      })
      expect(panel.emitToER).toHaveBeenCalledWith(
        'er-1',
        'day.opened',
        expect.objectContaining({ openedAt: expect.any(Date) }),
      )
    })

    it('force-closes leftover tickets from previous days before opening', async () => {
      // isDayOpen ficou true de ontem, mas não há fila para hoje → não é conflito
      tx.eR.findUnique.mockResolvedValue({ id: 'er-1', isDayOpen: true })
      tx.queue.findUnique.mockResolvedValue(null)
      tx.ticket.findMany.mockResolvedValue([
        { id: 't1', counterId: 'c1', state: TicketState.CALLING },
        { id: 't2', counterId: null, state: TicketState.WAITING },
      ])
      tx.ticket.updateMany.mockResolvedValue({ count: 2 })
      tx.counter.updateMany.mockResolvedValue({ count: 1 })
      tx.eR.update.mockResolvedValue({ id: 'er-1', isDayOpen: true })

      const result = await service.openDay('er-1', manager)

      expect(result.isDayOpen).toBe(true)
      expect(tx.ticket.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['t1', 't2'] } },
        data: { state: TicketState.NO_SHOW, noShowAt: expect.any(Date) },
      })
      expect(tx.counter.updateMany).toHaveBeenCalledWith({
        where: { erId: 'er-1', state: { not: CounterState.UNAVAILABLE } },
        data: { state: CounterState.UNAVAILABLE, operatorId: null },
      })
      expect(tx.auditEvent.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({ eventType: 'ticket_force_closed', ticketId: 't1' }),
          expect.objectContaining({ eventType: 'ticket_force_closed', ticketId: 't2' }),
        ],
      })
      expect(tx.auditEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: 'daily_queue_opened',
          metadata: { forcedClosedCount: 2, releasedCounters: 1 },
        }),
      })
    })

    it('sweeps PAUSED/IN_SERVICE leftovers from previous days with rollover audit', async () => {
      // Saneamento de virada de dia: senhas PENDENTES (incluindo PAUSED) de dias
      // ANTERIORES (businessDate < hoje) viram NO_SHOW. Este teste blinda o filtro
      // (lt, não lte/equals), a inclusão de PAUSED/IN_SERVICE na constante de estados
      // e a metadata de auditoria — coisas que o teste acima não afirma.
      tx.eR.findUnique.mockResolvedValue({ id: 'er-1', isDayOpen: true })
      tx.queue.findUnique.mockResolvedValue(null)
      tx.ticket.findMany.mockResolvedValue([
        { id: 't9', counterId: 'c9', state: TicketState.PAUSED },
      ])
      tx.ticket.updateMany.mockResolvedValue({ count: 1 })
      tx.counter.updateMany.mockResolvedValue({ count: 0 })
      tx.eR.update.mockResolvedValue({ id: 'er-1', isDayOpen: true })

      await service.openDay('er-1', manager)

      // Filtro: só estados pendentes (incl. IN_SERVICE e PAUSED) de dias anteriores.
      expect(tx.ticket.findMany).toHaveBeenCalledWith({
        where: {
          erId: 'er-1',
          state: {
            in: [
              TicketState.WAITING,
              TicketState.CALLING,
              TicketState.IN_SERVICE,
              TicketState.PAUSED,
            ],
          },
          queue: { businessDate: { lt: expect.any(Date) } },
        },
        select: { id: true, counterId: true, state: true },
      })

      // A senha PAUSED é encerrada como NO_SHOW...
      expect(tx.ticket.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['t9'] } },
        data: { state: TicketState.NO_SHOW, noShowAt: expect.any(Date) },
      })

      // ...e a auditoria carrega reason/previousState/counterId para preservar os indicadores.
      expect(tx.auditEvent.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            eventType: 'ticket_force_closed',
            ticketId: 't9',
            metadata: expect.objectContaining({
              forcedClose: true,
              reason: 'day_rollover',
              previousState: TicketState.PAUSED,
              counterId: 'c9',
            }),
          }),
        ],
      })
    })

    it('rejects opening when the day is already open today', async () => {
      tx.eR.findUnique.mockResolvedValue({ id: 'er-1', isDayOpen: true })
      tx.queue.findUnique.mockResolvedValue({ closedAt: null })

      await expect(service.openDay('er-1', manager)).rejects.toThrow(ConflictException)

      expect(tx.ticket.findMany).not.toHaveBeenCalled()
      expect(tx.eR.update).not.toHaveBeenCalled()
    })
  })
})