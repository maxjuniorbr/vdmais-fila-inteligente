import { Logger } from '@nestjs/common'
import { CounterState, TicketState } from '@prisma/client'
import { PanelGateway } from '../../panel/panel.gateway'
import { PrismaService } from '../../prisma/prisma.service'
import { TicketTimeoutService } from '../ticket-timeout.service'

const tx = {
  ticket: { updateMany: jest.fn() },
  counter: { updateMany: jest.fn() },
  auditEvent: { create: jest.fn() },
}

const prisma = {
  ticket: { findMany: jest.fn() },
  $transaction: jest.fn((cb: (client: typeof tx) => Promise<unknown>) => cb(tx)),
}

const panel = { emitToER: jest.fn() }

function buildService() {
  return new TicketTimeoutService(
    prisma as unknown as PrismaService,
    panel as unknown as PanelGateway,
  )
}

function makeTicket(
  id: string,
  erId: string,
  calledAt: Date,
  callTimeoutSeconds: number,
  counterId: string | null = 'c1',
) {
  return { id, erId, code: `${id}-code`, counterId, calledAt, er: { callTimeoutSeconds } }
}

describe('TicketTimeoutService.sweepExpiredCalls', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    prisma.$transaction.mockImplementation((cb: (client: typeof tx) => Promise<unknown>) => cb(tx))
    tx.ticket.updateMany.mockResolvedValue({ count: 1 })
    tx.counter.updateMany.mockResolvedValue({ count: 1 })
    tx.auditEvent.create.mockResolvedValue({})
    prisma.ticket.findMany.mockResolvedValue([])
  })

  it('queries CALLING tickets from ERs with a non-zero timeout', async () => {
    const service = buildService()

    await service.sweepExpiredCalls(new Date('2026-06-11T12:00:00Z'))

    expect(prisma.ticket.findMany).toHaveBeenCalledWith({
      where: {
        state: TicketState.CALLING,
        er: { callTimeoutSeconds: { gt: 0 } },
      },
      select: {
        id: true,
        erId: true,
        code: true,
        counterId: true,
        calledAt: true,
        er: { select: { callTimeoutSeconds: true } },
      },
    })
  })

  it('marks expired calls as no-show, frees the counter and notifies the panel', async () => {
    const now = new Date('2026-06-11T12:00:00Z')
    const calledAt = new Date('2026-06-11T11:49:00Z') // 11 min ago — exceeds 600 s default
    prisma.ticket.findMany.mockResolvedValue([makeTicket('t1', 'er-1', calledAt, 600)])
    const service = buildService()

    const closed = await service.sweepExpiredCalls(now)

    expect(closed).toBe(1)
    expect(tx.ticket.updateMany).toHaveBeenCalledWith({
      where: { id: 't1', state: TicketState.CALLING },
      data: { state: TicketState.NO_SHOW, noShowAt: expect.any(Date) },
    })
    expect(tx.counter.updateMany).toHaveBeenCalledWith({
      where: { id: 'c1', state: CounterState.CALLING },
      data: { state: CounterState.ACTIVE },
    })
    expect(tx.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: 'ticket_auto_no_show',
        metadata: expect.objectContaining({ reason: 'call_timeout' }),
      }),
    })
    expect(panel.emitToER).toHaveBeenCalledWith(
      'er-1',
      'ticket.no_show',
      expect.objectContaining({ ticketId: 't1' }),
    )
  })

  it('respects the per-ER timeout: skips tickets that have not yet elapsed', async () => {
    const now = new Date('2026-06-11T12:00:00Z')
    const calledAt = new Date('2026-06-11T11:51:00Z') // 9 min ago = 540 s

    prisma.ticket.findMany.mockResolvedValue([
      makeTicket('t1', 'er-1', calledAt, 600), // needs 10 min → not expired
      makeTicket('t2', 'er-2', calledAt, 300), // needs  5 min → expired (9 > 5)
    ])
    const service = buildService()

    const closed = await service.sweepExpiredCalls(now)

    expect(closed).toBe(1)
    expect(tx.ticket.updateMany).toHaveBeenCalledTimes(1)
    expect(tx.ticket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 't2' }) }),
    )
  })

  it('does not notify or count when a concurrent action already changed the ticket', async () => {
    const now = new Date('2026-06-11T12:00:00Z')
    const calledAt = new Date('2026-06-11T11:49:00Z')
    prisma.ticket.findMany.mockResolvedValue([makeTicket('t1', 'er-1', calledAt, 600)])
    tx.ticket.updateMany.mockResolvedValue({ count: 0 })
    const service = buildService()

    const closed = await service.sweepExpiredCalls(now)

    expect(closed).toBe(0)
    expect(tx.counter.updateMany).not.toHaveBeenCalled()
    expect(panel.emitToER).not.toHaveBeenCalled()
  })

  describe('handleCron', () => {
    it('delegates to the sweep on each tick', async () => {
      const service = buildService()
      const sweep = jest.spyOn(service, 'sweepExpiredCalls').mockResolvedValue(2)

      await service.handleCron()

      expect(sweep).toHaveBeenCalledTimes(1)
    })

    it('swallows sweep failures so the scheduler keeps running', async () => {
      const service = buildService()
      jest.spyOn(service, 'sweepExpiredCalls').mockRejectedValue(new Error('db down'))

      await expect(service.handleCron()).resolves.toBeUndefined()
    })
  })
})
