import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { CounterState, EntryChannel, Role, TicketState } from '@prisma/client'
import { PanelGateway } from '../../panel/panel.gateway'
import { PrismaService } from '../../prisma/prisma.service'
import { QueueService } from '../queue.service'

const operator = {
  userId: 'op-1',
  role: Role.OPERATOR,
  erId: 'er-1',
}
const admin = {
  userId: 'admin-1',
  role: Role.ADMIN,
}

const counter = {
  id: 'counter-1',
  erId: 'er-1',
  number: 1,
  state: CounterState.ACTIVE,
  operatorId: 'op-1',
}

const calledTicket = {
  id: 'ticket-1',
  code: 'A001',
  state: TicketState.CALLING,
  entryChannel: EntryChannel.QR_CODE,
  queuePosition: 1,
  queueId: 'queue-1',
  erId: 'er-1',
  representativeId: 'rep-1',
  counterId: 'counter-1',
  operatorId: 'op-1',
  checkinAttendantId: null,
  calledAt: new Date(),
  serviceStartedAt: null,
  serviceFinishedAt: null,
  noShowAt: null,
  cancelledAt: null,
  cancelReason: null,
  restoreReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  representative: { fullName: 'Maria Silva' },
  counter: { number: 1 },
}

const tx = {
  $queryRaw: jest.fn(),
  counter: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  ticket: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  queue: {
    findUnique: jest.fn(),
  },
  auditEvent: {
    create: jest.fn(),
  },
}
const prisma = {
  $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  auditEvent: { create: jest.fn() },
  eR: { findUnique: jest.fn() },
  ticket: { findMany: jest.fn() },
  counter: { findMany: jest.fn() },
}
const panel = { emitToER: jest.fn() }

describe('QueueService.callNext', () => {
  let service: QueueService

  beforeEach(() => {
    jest.resetAllMocks()
    prisma.$transaction.mockImplementation((callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    )
    service = new QueueService(prisma as unknown as PrismaService, panel as unknown as PanelGateway)
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: 'counter-1' }])
      .mockResolvedValueOnce([{ id: 'ticket-1' }])
    tx.counter.findUnique.mockResolvedValue(counter)
    tx.ticket.findFirst.mockResolvedValue(null)
    tx.queue.findUnique.mockResolvedValue({ id: 'queue-1' })
    tx.ticket.update.mockResolvedValue(calledTicket)
    tx.counter.update.mockResolvedValue({
      ...counter,
      state: CounterState.CALLING,
    })
    tx.auditEvent.create.mockResolvedValue({})
    prisma.auditEvent.create.mockResolvedValue({})
    prisma.ticket.findMany.mockResolvedValue([])
    prisma.counter.findMany.mockResolvedValue([])
    prisma.eR.findUnique.mockResolvedValue({ isDayOpen: true })
  })

  it('allows a global administrator to view a selected ER queue', async () => {
    await expect(service.getQueueOverview('er-2', admin)).resolves.toEqual({
      isDayOpen: true,
      waiting: [],
      calling: [],
      inService: [],
      paused: [],
      recent: [],
      counters: [],
    })
  })

  it('reports the operation as closed in the overview when the day is not open', async () => {
    prisma.eR.findUnique.mockResolvedValue({ isDayOpen: false })

    await expect(service.getQueueOverview('er-1', operator)).resolves.toMatchObject({
      isDayOpen: false,
    })
  })

  it('orders the waiting overview by priority then queue position', async () => {
    await service.getQueueOverview('er-1', operator)

    expect(prisma.ticket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ state: TicketState.WAITING }),
        orderBy: [{ isPriority: 'desc' }, { queuePosition: 'asc' }],
      }),
    )
  })

  it('locks the next ticket ordering preferential ones first', async () => {
    await service.callNext('er-1', 'counter-1', operator)

    // O segundo $queryRaw seleciona a próxima senha WAITING para travar.
    const selectTicketCall = tx.$queryRaw.mock.calls[1][0] as string[]
    const sql = selectTicketCall.join('?')
    expect(sql).toMatch(/"isPriority"\s+DESC/)
    expect(sql).toMatch(/"queuePosition"\s+ASC/)
  })

  it('rejects non-operators before opening a transaction', async () => {
    await expect(service.callNext('er-1', 'counter-1', admin)).rejects.toThrow(ForbiddenException)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('rejects access to another ER before opening a transaction', async () => {
    await expect(service.callNext('er-2', 'counter-1', operator)).rejects.toThrow(
      ForbiddenException,
    )
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('fails when the counter does not exist', async () => {
    tx.counter.findUnique.mockResolvedValue(null)

    await expect(service.callNext('er-1', 'counter-1', operator)).rejects.toThrow(NotFoundException)
  })

  it('rejects a counter that belongs to a different ER', async () => {
    tx.counter.findUnique.mockResolvedValue({ ...counter, erId: 'er-2' })

    await expect(service.callNext('er-1', 'counter-1', operator)).rejects.toThrow(
      BadRequestException,
    )
  })

  it('rejects calling when the counter is not active', async () => {
    tx.counter.findUnique.mockResolvedValue({
      ...counter,
      state: CounterState.PAUSED,
    })

    await expect(service.callNext('er-1', 'counter-1', operator)).rejects.toThrow(
      BadRequestException,
    )
  })

  it('rejects calling when the ER operation is not open today', async () => {
    tx.queue.findUnique.mockResolvedValue(null)

    await expect(service.callNext('er-1', 'counter-1', operator)).rejects.toThrow(
      BadRequestException,
    )
  })

  it('requires the authenticated operator to own an active counter', async () => {
    tx.counter.findUnique.mockResolvedValue({
      ...counter,
      operatorId: 'op-2',
    })

    await expect(service.callNext('er-1', 'counter-1', operator)).rejects.toThrow(
      ForbiddenException,
    )
  })

  it('blocks a second open ticket for the operator', async () => {
    tx.ticket.findFirst.mockResolvedValue({
      id: 'existing',
      state: TicketState.IN_SERVICE,
    })

    await expect(service.callNext('er-1', 'counter-1', operator)).rejects.toThrow(
      BadRequestException,
    )
  })

  it('returns an empty-queue error when SKIP LOCKED finds no ticket', async () => {
    tx.$queryRaw
      .mockReset()
      .mockResolvedValueOnce([{ id: 'counter-1' }])
      .mockResolvedValueOnce([])

    await expect(service.callNext('er-1', 'counter-1', operator)).rejects.toThrow(
      BadRequestException,
    )
  })

  it('locks, calls and audits the next ticket in one transaction', async () => {
    const result = await service.callNext('er-1', 'counter-1', operator)

    expect(result.state).toBe(TicketState.CALLING)
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2)
    expect(tx.ticket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ticket-1' },
        data: expect.objectContaining({
          state: TicketState.CALLING,
          operatorId: 'op-1',
          counterId: 'counter-1',
        }),
      }),
    )
    expect(panel.emitToER).toHaveBeenCalledWith(
      'er-1',
      'ticket.called',
      expect.objectContaining({
        code: 'A001',
        displayName: 'Maria S.',
        counterNumber: 1,
      }),
    )
    expect(tx.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: 'ticket_called',
        metadata: expect.objectContaining({
          counterId: 'counter-1',
          counterNumber: 1,
          displayName: 'Maria S.',
        }),
      }),
    })
    expect(tx.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: 'ticket_locked_for_call',
      }),
    })
  })

  it('falls back to counter number zero when the called ticket has no counter', async () => {
    tx.ticket.update.mockResolvedValue({ ...calledTicket, counter: null })

    const result = await service.callNext('er-1', 'counter-1', operator)

    expect(result.counter).toBeNull()
    expect(tx.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: 'ticket_called',
        metadata: expect.objectContaining({ counterNumber: 0 }),
      }),
    })
    expect(panel.emitToER).toHaveBeenCalledWith(
      'er-1',
      'ticket.called',
      expect.objectContaining({ counterNumber: 0 }),
    )
  })
})
