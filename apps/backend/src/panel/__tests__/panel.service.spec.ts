import { EntryChannel, TicketState } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { abbreviateName } from '../panel.presenter'
import { PanelService } from '../panel.service'

describe('panel presentation', () => {
  it('skips Portuguese name particles when abbreviating the surname', () => {
    expect(abbreviateName('Maria da Silva Santos')).toBe('Maria S.')
    expect(abbreviateName('João dos Reis')).toBe('João R.')
    expect(abbreviateName('Ana Souza')).toBe('Ana S.')
  })
})

describe('PanelService', () => {
  const prisma = {
    eR: { findUnique: jest.fn() },
    ticket: { findFirst: jest.fn(), findMany: jest.fn() },
    auditEvent: { findMany: jest.fn() },
    counter: { findMany: jest.fn() },
  }

  beforeEach(() => {
    jest.resetAllMocks()
    prisma.eR.findUnique.mockResolvedValue({ id: 'er-1' })
    prisma.ticket.findFirst.mockResolvedValue(null)
    prisma.ticket.findMany.mockResolvedValue([])
    prisma.counter.findMany.mockResolvedValue([{ id: 'counter-4', number: 4 }])
  })

  it('keeps a restored ticket in recent calls using the audit event', async () => {
    prisma.auditEvent.findMany.mockResolvedValue([
      {
        id: 'call-event-1',
        eventType: 'ticket_called',
        ticketId: 'ticket-1',
        createdAt: new Date('2026-06-10T12:00:00Z'),
        metadata: { counterId: 'counter-4' },
        ticket: {
          id: 'ticket-1',
          code: 'A001',
          state: TicketState.WAITING,
          entryChannel: EntryChannel.LINK,
          representative: { fullName: 'Maria da Silva Santos' },
          counter: null,
        },
      },
    ])
    const service = new PanelService(prisma as unknown as PrismaService)

    const result = await service.getState('er-1')

    expect(result.recent).toEqual([
      expect.objectContaining({
        ticketId: 'ticket-1',
        code: 'A001',
        displayName: 'Maria S.',
        counterNumber: 4,
      }),
    ])
  })
})
