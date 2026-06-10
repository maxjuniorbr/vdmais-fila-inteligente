import { ConflictException } from '@nestjs/common'
import { Role, TicketState } from '@prisma/client'
import { PanelGateway } from '../../panel/panel.gateway'
import { PrismaService } from '../../prisma/prisma.service'
import { ERService } from '../er.service'

const manager = { userId: 'manager-1', role: Role.MANAGER, erId: 'er-1' }
const tx = {
  $queryRaw: jest.fn(),
  eR: { findUnique: jest.fn(), update: jest.fn() },
  queue: { updateMany: jest.fn(), upsert: jest.fn() },
  ticket: { count: jest.fn() },
  auditEvent: { create: jest.fn() },
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
  })

  it('blocks day closing while a ticket is waiting, calling, or paused', async () => {
    tx.ticket.count.mockResolvedValue(1)

    await expect(service.closeDay('er-1', manager)).rejects.toThrow(ConflictException)

    expect(tx.ticket.count).toHaveBeenCalledWith({
      where: {
        erId: 'er-1',
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
})
