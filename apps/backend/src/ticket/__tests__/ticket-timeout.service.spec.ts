import { ConfigService } from '@nestjs/config'
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

function buildService(minutes = '10') {
  const config = { get: jest.fn().mockReturnValue(minutes) } as unknown as ConfigService
  return new TicketTimeoutService(
    prisma as unknown as PrismaService,
    panel as unknown as PanelGateway,
    config,
  )
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

  it('queries CALLING tickets older than the configured timeout', async () => {
    const service = buildService('10')
    const now = new Date('2026-06-11T12:00:00Z')

    await service.sweepExpiredCalls(now)

    expect(prisma.ticket.findMany).toHaveBeenCalledWith({
      where: {
        state: TicketState.CALLING,
        calledAt: { lt: new Date('2026-06-11T11:50:00Z') },
      },
      select: { id: true, erId: true, code: true, counterId: true },
    })
  })

  it('marks expired calls as no-show, frees the counter and notifies the panel', async () => {
    prisma.ticket.findMany.mockResolvedValue([
      { id: 't1', erId: 'er-1', code: 'A001', counterId: 'c1' },
    ])
    const service = buildService('10')

    const closed = await service.sweepExpiredCalls(new Date('2026-06-11T12:00:00Z'))

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

  it('does not notify or count when a concurrent action already changed the ticket', async () => {
    prisma.ticket.findMany.mockResolvedValue([
      { id: 't1', erId: 'er-1', code: 'A001', counterId: 'c1' },
    ])
    tx.ticket.updateMany.mockResolvedValue({ count: 0 })
    const service = buildService('10')

    const closed = await service.sweepExpiredCalls(new Date('2026-06-11T12:00:00Z'))

    expect(closed).toBe(0)
    expect(tx.counter.updateMany).not.toHaveBeenCalled()
    expect(panel.emitToER).not.toHaveBeenCalled()
  })

  it('falls back to the default timeout when the env value is invalid', async () => {
    const service = buildService('not-a-number')
    const now = new Date('2026-06-11T12:00:00Z')

    await service.sweepExpiredCalls(now)

    expect(prisma.ticket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          calledAt: { lt: new Date('2026-06-11T11:50:00Z') },
        }),
      }),
    )
  })

  describe('handleCron', () => {
    it('delegates to the sweep on each tick', async () => {
      const service = buildService('10')
      const sweep = jest.spyOn(service, 'sweepExpiredCalls').mockResolvedValue(2)

      await service.handleCron()

      expect(sweep).toHaveBeenCalledTimes(1)
    })

    it('swallows sweep failures so the scheduler keeps running', async () => {
      const service = buildService('10')
      jest.spyOn(service, 'sweepExpiredCalls').mockRejectedValue(new Error('db down'))

      await expect(service.handleCron()).resolves.toBeUndefined()
    })
  })
})
