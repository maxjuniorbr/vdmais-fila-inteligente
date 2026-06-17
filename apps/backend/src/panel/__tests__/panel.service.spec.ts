import { TicketState } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { PanelService } from '../panel.service'

describe('PanelService', () => {
  const prisma = {
    eR: { findUnique: jest.fn() },
    ticket: { findFirst: jest.fn(), findMany: jest.fn() },
  }

  beforeEach(() => {
    jest.resetAllMocks()
    prisma.eR.findUnique.mockResolvedValue({ id: 'er-1', isDayOpen: true })
    prisma.ticket.findFirst.mockResolvedValue(null)
    prisma.ticket.findMany.mockResolvedValue([])
  })

  it('exposes whether the operation day is open', async () => {
    const service = new PanelService(prisma as unknown as PrismaService)
    await expect(service.getState('er-1')).resolves.toMatchObject({ isDayOpen: true })

    prisma.eR.findUnique.mockResolvedValue({ id: 'er-1', isDayOpen: false })
    await expect(service.getState('er-1')).resolves.toMatchObject({ isDayOpen: false })
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
    expect(result.current).toEqual(
      expect.objectContaining({ code: 'A002', counterNumber: 2, displayName: 'Carla M.' }),
    )
    expect(result.calling[0]).not.toHaveProperty('ticketId')
    expect(result.calling[0]).not.toHaveProperty('calledAt')
  })

  it('defaults counterNumber to 0 and tolerates a missing calledAt', async () => {
    prisma.ticket.findMany.mockImplementation((args: { where?: { state?: TicketState } }) => {
      const state = args?.where?.state
      if (state === TicketState.CALLING) {
        return Promise.resolve([
          { id: 't1', code: 'A001', calledAt: null, representative: { fullName: 'Ana Paula' }, counter: null },
        ])
      }
      if (state === TicketState.IN_SERVICE) {
        return Promise.resolve([{ id: 's1', code: 'B001', counter: null }])
      }
      return Promise.resolve([])
    })
    const service = new PanelService(prisma as unknown as PrismaService)

    const result = await service.getState('er-1')

    expect(result.calling[0]).toMatchObject({ code: 'A001', counterNumber: 0 })
    expect(result.current).toMatchObject({ code: 'A001', counterNumber: 0 })
    expect(result.inService[0]).toEqual({ code: 'B001', counterNumber: 0 })
  })

  it('throws when the ER does not exist', async () => {
    prisma.eR.findUnique.mockResolvedValue(null)
    const service = new PanelService(prisma as unknown as PrismaService)
    await expect(service.getState('missing')).rejects.toThrow('ER não encontrado')
  })

  it('computes average service and wait times and maps in-service/waiting lists', async () => {
    prisma.ticket.findMany.mockImplementation((args: { where?: { state?: TicketState } }) => {
      const state = args?.where?.state
      if (state === TicketState.CALLING) {
        return Promise.resolve([])
      }
      if (state === TicketState.IN_SERVICE) {
        return Promise.resolve([{ id: 's-1', code: 'B001', counter: { number: 3 } }])
      }
      if (state === TicketState.WAITING) {
        return Promise.resolve([
          { id: 'w-1', code: 'C001', queuePosition: 1, createdAt: new Date() },
        ])
      }
      if (state === TicketState.FINISHED) {
        return Promise.resolve([
          {
            serviceStartedAt: new Date('2026-06-10T12:00:00Z'),
            serviceFinishedAt: new Date('2026-06-10T12:05:00Z'),
          },
        ])
      }
      return Promise.resolve([
        {
          createdAt: new Date('2026-06-10T11:00:00Z'),
          calledAt: new Date('2026-06-10T11:02:00Z'),
          pausedSeconds: 0,
        },
      ])
    })
    const service = new PanelService(prisma as unknown as PrismaService)

    const result = await service.getState('er-1')

    expect(result.avgServiceSeconds).toBe(300)
    expect(result.avgWaitSeconds).toBe(120)
    expect(result.inService).toEqual([
      expect.objectContaining({ code: 'B001', counterNumber: 3 }),
    ])
    expect(result.waiting).toEqual([expect.objectContaining({ code: 'C001', position: 1 })])
    expect(result.inService[0]).not.toHaveProperty('ticketId')
    expect(result.waiting[0]).not.toHaveProperty('createdAt')
  })
})
