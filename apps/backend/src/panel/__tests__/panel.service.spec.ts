import { TicketState } from '@prisma/client'
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
  }

  beforeEach(() => {
    jest.resetAllMocks()
    prisma.eR.findUnique.mockResolvedValue({ id: 'er-1' })
    prisma.ticket.findFirst.mockResolvedValue(null)
    prisma.ticket.findMany.mockResolvedValue([])
  })

  it('returns every calling ticket (one per counter) and the most recent as current', async () => {
    prisma.ticket.findMany.mockImplementation((args: { where?: { state?: TicketState } }) => {
      if (args?.where?.state === TicketState.CALLING) {
        return Promise.resolve([
          {
            id: 'ticket-1',
            code: 'A001',
            calledAt: new Date('2026-06-10T12:00:00Z'),
            representative: { fullName: 'Ana Paula Ferreira' },
            counter: { number: 1 },
          },
          {
            id: 'ticket-2',
            code: 'A002',
            calledAt: new Date('2026-06-10T12:01:00Z'),
            representative: { fullName: 'Carla Mendes Costa' },
            counter: { number: 2 },
          },
        ])
      }
      return Promise.resolve([])
    })
    const service = new PanelService(prisma as unknown as PrismaService)

    const result = await service.getState('er-1')

    expect(result.calling).toEqual([
      expect.objectContaining({ code: 'A001', counterNumber: 1, displayName: 'Ana P.' }),
      expect.objectContaining({ code: 'A002', counterNumber: 2, displayName: 'Carla M.' }),
    ])
    expect(result.current).toEqual(expect.objectContaining({ ticketId: 'ticket-2' }))
  })
})
