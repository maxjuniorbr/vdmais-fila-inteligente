import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { CounterState, EntryChannel, Role, TicketState } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { TicketService } from '../ticket/ticket.service'
import { QueueService } from '../queue/queue.service'
import { CounterService } from '../counter/counter.service'
import { SimulationService } from './simulation.service'

const prisma = {
  eR: { findMany: jest.fn() },
  operator: { findMany: jest.fn() },
  counter: { findMany: jest.fn(), findUnique: jest.fn() },
  representative: { findMany: jest.fn() },
  ticket: { findUnique: jest.fn() },
}

const ticketService = {
  create: jest.fn(),
  pauseTicket: jest.fn(),
  resumeTicket: jest.fn(),
  selfCancel: jest.fn(),
  startService: jest.fn(),
  finishService: jest.fn(),
  noShow: jest.fn(),
}

const queueService = {
  getQueueOverview: jest.fn(),
  callNext: jest.fn(),
}

const counterService = {
  openCounter: jest.fn(),
  closeCounter: jest.fn(),
}

describe('SimulationService', () => {
  let service: SimulationService

  beforeEach(() => {
    jest.resetAllMocks()
    service = new SimulationService(
      prisma as unknown as PrismaService,
      ticketService as unknown as TicketService,
      queueService as unknown as QueueService,
      counterService as unknown as CounterService,
    )
  })

  describe('listErs', () => {
    it('returns ERs ordered by name', async () => {
      const ers = [{ id: 'er-1', name: 'ER A', isDayOpen: true }]
      prisma.eR.findMany.mockResolvedValue(ers)
      const result = await service.listErs()
      expect(result).toBe(ers)
      expect(prisma.eR.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { name: 'asc' } }),
      )
    })
  })

  describe('getState', () => {
    it('returns queue overview using a synthetic manager user', async () => {
      const overview = { waiting: 5 }
      queueService.getQueueOverview.mockResolvedValue(overview)
      const result = await service.getState('er-1')
      expect(result).toBe(overview)
      expect(queueService.getQueueOverview).toHaveBeenCalledWith(
        'er-1',
        expect.objectContaining({ role: Role.MANAGER, erId: 'er-1' }),
      )
    })
  })

  describe('listOperators', () => {
    it('maps operators with counter info and hasOpenCounter flag', async () => {
      prisma.operator.findMany.mockResolvedValue([
        { id: 'op-1', name: 'Op 1', email: 'op1@gb.com.br', counter: { number: 3, state: CounterState.ACTIVE } },
        { id: 'op-2', name: 'Op 2', email: 'op2@gb.com.br', counter: null },
      ])
      const result = await service.listOperators('er-1')
      expect(result).toEqual([
        { id: 'op-1', name: 'Op 1', email: 'op1@gb.com.br', hasOpenCounter: true, counterNumber: 3 },
        { id: 'op-2', name: 'Op 2', email: 'op2@gb.com.br', hasOpenCounter: false, counterNumber: null },
      ])
    })
  })

  describe('listCounters', () => {
    it('maps counters with isFree=true when UNAVAILABLE', async () => {
      prisma.counter.findMany.mockResolvedValue([
        { id: 'c-1', number: 1, state: CounterState.UNAVAILABLE, operator: null },
        { id: 'c-2', number: 2, state: CounterState.ACTIVE, operator: { id: 'op-1', name: 'Op 1' } },
      ])
      const result = await service.listCounters('er-1')
      expect(result[0].isFree).toBe(true)
      expect(result[1].isFree).toBe(false)
    })
  })

  describe('listRepresentatives', () => {
    it('maps representatives with active ticket and null when absent', async () => {
      prisma.representative.findMany.mockResolvedValue([
        {
          id: 're-1',
          fullName: 'RE One',
          reCode: 'RE0001',
          tickets: [{ id: 't-1', code: 'A001', state: TicketState.WAITING }],
        },
        { id: 're-2', fullName: 'RE Two', reCode: 'RE0002', tickets: [] },
      ])
      const result = await service.listRepresentatives('er-1')
      expect(result[0].ticket).toEqual({ id: 't-1', code: 'A001', state: TicketState.WAITING })
      expect(result[1].ticket).toBeNull()
    })
  })

  describe('openCounters', () => {
    it('opens counters pairing each with a free operator', async () => {
      prisma.operator.findMany.mockResolvedValue([{ id: 'op-1', name: 'Op 1' }])
      prisma.counter.findMany.mockResolvedValue([{ id: 'c-1' }])
      counterService.openCounter.mockResolvedValue({ number: 1 })

      const result = await service.openCounters('er-1', ['c-1'])
      expect(result.opened).toBe(1)
      expect(result.skipped).toBe(0)
      expect(counterService.openCounter).toHaveBeenCalledWith(
        'c-1',
        expect.objectContaining({ userId: 'op-1', role: Role.OPERATOR }),
      )
    })

    it('deduplicates counter IDs before processing', async () => {
      prisma.operator.findMany.mockResolvedValue([{ id: 'op-1', name: 'Op 1' }])
      prisma.counter.findMany.mockResolvedValue([{ id: 'c-1' }])
      counterService.openCounter.mockResolvedValue({ number: 1 })

      const result = await service.openCounters('er-1', ['c-1', 'c-1'])
      expect(result.opened).toBe(1)
      expect(counterService.openCounter).toHaveBeenCalledTimes(1)
    })

    it('skips counters that do not belong to the ER', async () => {
      prisma.operator.findMany.mockResolvedValue([{ id: 'op-1', name: 'Op 1' }])
      prisma.counter.findMany.mockResolvedValue([]) // counter not in this ER

      const result = await service.openCounters('er-1', ['c-foreign'])
      expect(result.opened).toBe(0)
      expect(result.skipped).toBe(1)
      expect(result.results[0].reason).toMatch(/não encontrado/i)
    })

    it('skips when no free operator is available', async () => {
      prisma.operator.findMany.mockResolvedValue([]) // no free operators
      prisma.counter.findMany.mockResolvedValue([{ id: 'c-1' }])

      const result = await service.openCounters('er-1', ['c-1'])
      expect(result.opened).toBe(0)
      expect(result.skipped).toBe(1)
      expect(result.results[0].reason).toMatch(/sem operador\(a\)/i)
    })

    it('returns failed operator to pool so the next counter can use it', async () => {
      prisma.operator.findMany.mockResolvedValue([
        { id: 'op-1', name: 'Op 1' },
        { id: 'op-2', name: 'Op 2' },
      ])
      prisma.counter.findMany.mockResolvedValue([{ id: 'c-1' }, { id: 'c-2' }])
      counterService.openCounter
        .mockRejectedValueOnce(new Error('Dia fechado'))
        .mockResolvedValueOnce({ number: 2 })

      const result = await service.openCounters('er-1', ['c-1', 'c-2'])
      expect(result.opened).toBe(1)
      expect(result.skipped).toBe(1)
    })
  })

  describe('closeCounter', () => {
    it('closes an open counter via the counter service', async () => {
      prisma.counter.findUnique.mockResolvedValue({ id: 'c-1', erId: 'er-1', operatorId: 'op-1' })
      counterService.closeCounter.mockResolvedValue({ id: 'c-1' })

      await service.closeCounter('er-1', 'c-1')
      expect(counterService.closeCounter).toHaveBeenCalledWith(
        'c-1',
        expect.objectContaining({ userId: 'op-1', role: Role.OPERATOR }),
      )
    })

    it('throws NotFoundException when counter does not exist', async () => {
      prisma.counter.findUnique.mockResolvedValue(null)
      await expect(service.closeCounter('er-1', 'c-1')).rejects.toThrow(NotFoundException)
    })

    it('throws NotFoundException when counter belongs to another ER', async () => {
      prisma.counter.findUnique.mockResolvedValue({ id: 'c-1', erId: 'er-2', operatorId: 'op-1' })
      await expect(service.closeCounter('er-1', 'c-1')).rejects.toThrow(NotFoundException)
    })

    it('throws BadRequestException when counter has no operator (not open)', async () => {
      prisma.counter.findUnique.mockResolvedValue({ id: 'c-1', erId: 'er-1', operatorId: null })
      await expect(service.closeCounter('er-1', 'c-1')).rejects.toThrow(BadRequestException)
    })
  })

  describe('addExistingToQueue', () => {
    it('adds representatives and returns included count', async () => {
      ticketService.create.mockResolvedValue({ code: 'A001' })
      const result = await service.addExistingToQueue('er-1', ['re-1'], EntryChannel.QR_CODE)
      expect(result.included).toBe(1)
      expect(result.ignored).toBe(0)
      expect(result.results[0].code).toBe('A001')
    })

    it('counts a ConflictException as ignored with friendly reason', async () => {
      ticketService.create.mockRejectedValue(new ConflictException('já tem senha'))
      const result = await service.addExistingToQueue('er-1', ['re-1'], EntryChannel.QR_CODE)
      expect(result.included).toBe(0)
      expect(result.ignored).toBe(1)
      expect(result.results[0].reason).toBe('Já possui senha ativa')
    })

    it('rejects CHECKIN_ASSISTED before calling ticket service', async () => {
      await expect(
        service.addExistingToQueue('er-1', ['re-1'], EntryChannel.CHECKIN_ASSISTED),
      ).rejects.toThrow(BadRequestException)
      expect(ticketService.create).not.toHaveBeenCalled()
    })

    it('defaults channel to QR_CODE when omitted', async () => {
      ticketService.create.mockResolvedValue({ code: 'A001' })
      await service.addExistingToQueue('er-1', ['re-1'])
      expect(ticketService.create).toHaveBeenCalledWith(
        expect.objectContaining({ entryChannel: EntryChannel.QR_CODE }),
        expect.objectContaining({ entryChannel: EntryChannel.QR_CODE }),
      )
    })
  })

  describe('pauseTicket / resumeTicket / cancelTicket', () => {
    beforeEach(() => {
      prisma.ticket.findUnique.mockResolvedValue({ representativeId: 're-1' })
    })

    it('pauses a waiting ticket via the representative', async () => {
      await service.pauseTicket('t-1')
      expect(ticketService.pauseTicket).toHaveBeenCalledWith('t-1', 're-1')
    })

    it('resumes a paused ticket via the representative', async () => {
      await service.resumeTicket('t-1')
      expect(ticketService.resumeTicket).toHaveBeenCalledWith('t-1', 're-1')
    })

    it('cancels a ticket via self-cancel', async () => {
      await service.cancelTicket('t-1')
      expect(ticketService.selfCancel).toHaveBeenCalledWith('t-1', 're-1')
    })

    it('throws NotFoundException when ticket does not exist', async () => {
      prisma.ticket.findUnique.mockResolvedValue(null)
      await expect(service.pauseTicket('t-1')).rejects.toThrow(NotFoundException)
    })
  })

  describe('startTicket / finishTicket / noShowTicket', () => {
    beforeEach(() => {
      prisma.ticket.findUnique.mockResolvedValue({ erId: 'er-1', operatorId: 'op-1' })
    })

    it('starts attendance using the ticket operator', async () => {
      await service.startTicket('t-1')
      expect(ticketService.startService).toHaveBeenCalledWith(
        't-1',
        expect.objectContaining({ userId: 'op-1', role: Role.OPERATOR, erId: 'er-1' }),
      )
    })

    it('finishes attendance using the ticket operator', async () => {
      await service.finishTicket('t-1')
      expect(ticketService.finishService).toHaveBeenCalledWith(
        't-1',
        expect.objectContaining({ userId: 'op-1', role: Role.OPERATOR }),
      )
    })

    it('registers no-show using the ticket operator', async () => {
      await service.noShowTicket('t-1')
      expect(ticketService.noShow).toHaveBeenCalledWith(
        't-1',
        expect.objectContaining({ userId: 'op-1', role: Role.OPERATOR }),
      )
    })

    it('throws NotFoundException when ticket does not exist', async () => {
      prisma.ticket.findUnique.mockResolvedValue(null)
      await expect(service.startTicket('t-1')).rejects.toThrow(NotFoundException)
    })

    it('throws BadRequestException when ticket has no assigned operator', async () => {
      prisma.ticket.findUnique.mockResolvedValue({ erId: 'er-1', operatorId: null })
      await expect(service.startTicket('t-1')).rejects.toThrow(BadRequestException)
    })
  })

  describe('callNextOnCounter', () => {
    it('calls next ticket using the counter operator', async () => {
      prisma.counter.findUnique.mockResolvedValue({ erId: 'er-1', operatorId: 'op-1' })
      await service.callNextOnCounter('c-1')
      expect(queueService.callNext).toHaveBeenCalledWith(
        'er-1',
        'c-1',
        expect.objectContaining({ userId: 'op-1', role: Role.OPERATOR }),
      )
    })

    it('throws NotFoundException when counter does not exist', async () => {
      prisma.counter.findUnique.mockResolvedValue(null)
      await expect(service.callNextOnCounter('c-1')).rejects.toThrow(NotFoundException)
    })

    it('throws BadRequestException when counter has no operator (not open)', async () => {
      prisma.counter.findUnique.mockResolvedValue({ erId: 'er-1', operatorId: null })
      await expect(service.callNextOnCounter('c-1')).rejects.toThrow(BadRequestException)
    })
  })
})
