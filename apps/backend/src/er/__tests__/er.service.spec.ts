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
    expect(tx.queue.updateMany).toHaveBeenCalled()
    expect(panel.emitToER).toHaveBeenCalledWith(
      'er-1',
      'day.closed',
      expect.objectContaining({ closedAt: expect.any(Date) }),
    )
  })

  it('auto-finishes in-service tickets when closing the day', async () => {
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

  it('finishes in-service tickets without touching counters when none are assigned', async () => {
    tx.ticket.count.mockResolvedValue(0)
    tx.ticket.findMany.mockResolvedValue([{ id: 'svc-1', counterId: null }])
    tx.ticket.updateMany.mockResolvedValue({ count: 1 })

    await service.closeDay('er-1', manager)

    expect(tx.ticket.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['svc-1'] } },
      data: { state: TicketState.FINISHED, serviceFinishedAt: expect.any(Date) },
    })
    expect(tx.counter.updateMany).not.toHaveBeenCalled()
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
    })

    await expect(service.getPublic('er-1')).resolves.toEqual({
      id: 'er-1',
      name: 'ER Centro',
      isDayOpen: true,
    })
    expect(prisma.eR.findUnique).toHaveBeenCalledWith({
      where: { id: 'er-1' },
      select: { id: true, name: true, isDayOpen: true },
    })
  })

  describe('openDay', () => {
    it('opens the day and creates the daily queue when there are no leftovers', async () => {
      tx.eR.findUnique.mockResolvedValue({ id: 'er-1', isDayOpen: false })
      tx.eR.update.mockResolvedValue({ id: 'er-1', isDayOpen: true })

      const result = await service.openDay('er-1', manager)

      expect(result.isDayOpen).toBe(true)
      expect(tx.ticket.updateMany).not.toHaveBeenCalled()
      expect(tx.queue.upsert).toHaveBeenCalled()
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

    it('rejects opening when the day is already open today', async () => {
      tx.eR.findUnique.mockResolvedValue({ id: 'er-1', isDayOpen: true })
      tx.queue.findUnique.mockResolvedValue({ closedAt: null })

      await expect(service.openDay('er-1', manager)).rejects.toThrow(ConflictException)

      expect(tx.ticket.findMany).not.toHaveBeenCalled()
      expect(tx.eR.update).not.toHaveBeenCalled()
    })
  })
})