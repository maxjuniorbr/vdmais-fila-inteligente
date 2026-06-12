import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common'
import { CounterState, EntryChannel, Role, TicketState } from '@prisma/client'
import { PanelGateway } from '../../panel/panel.gateway'
import { PrismaService } from '../../prisma/prisma.service'
import { CorrectionAction } from '../dto/ticket-action.dto'
import { TicketService } from '../ticket.service'

const representative = {
  userId: 'rep-1',
  role: Role.REPRESENTATIVE,
  erId: 'er-1',
  entryChannel: EntryChannel.QR_CODE,
}
const attendant = {
  userId: 'att-1',
  role: Role.ATTENDANT,
  erId: 'er-1',
}
const operator = {
  userId: 'op-1',
  role: Role.OPERATOR,
  erId: 'er-1',
}
const manager = {
  userId: 'mgr-1',
  role: Role.MANAGER,
  erId: 'er-1',
}

const ticketBase = {
  id: 'ticket-1',
  code: 'A001',
  state: TicketState.WAITING,
  entryChannel: EntryChannel.QR_CODE,
  queuePosition: 1,
  queueId: 'queue-1',
  erId: 'er-1',
  representativeId: 'rep-1',
  counterId: null,
  operatorId: null,
  checkinAttendantId: null,
  calledAt: null,
  serviceStartedAt: null,
  serviceFinishedAt: null,
  noShowAt: null,
  cancelledAt: null,
  cancelReason: null,
  restoreReason: null,
  pausedAt: null,
  pausedSeconds: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const tx = {
  $queryRaw: jest.fn(),
  eR: { findUnique: jest.fn() },
  representative: { findUnique: jest.fn() },
  queue: { upsert: jest.fn(), update: jest.fn() },
  ticket: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    aggregate: jest.fn(),
    findUniqueOrThrow: jest.fn(),
  },
  counter: { update: jest.fn() },
  auditEvent: { create: jest.fn() },
}

const prisma = {
  $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  ticket: { findUnique: jest.fn(), count: jest.fn() },
  auditEvent: { create: jest.fn() },
}
const panel = { emitToER: jest.fn() }

describe('TicketService', () => {
  let service: TicketService

  beforeEach(() => {
    jest.resetAllMocks()
    prisma.$transaction.mockImplementation((callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    )
    service = new TicketService(
      prisma as unknown as PrismaService,
      panel as unknown as PanelGateway,
    )
    tx.eR.findUnique.mockResolvedValue({
      id: 'er-1',
      isDayOpen: true,
      dayOpenedAt: new Date(),
    })
    tx.representative.findUnique.mockResolvedValue({
      id: 'rep-1',
      fullName: 'Maria Teste',
    })
    tx.ticket.findFirst.mockResolvedValue(null)
    tx.ticket.findUnique.mockResolvedValue(ticketBase)
    tx.ticket.count.mockResolvedValue(1)
    tx.queue.upsert.mockResolvedValue({ id: 'queue-1', nextSequence: 1 })
    tx.queue.update.mockResolvedValue({ id: 'queue-1', nextSequence: 2 })
    tx.ticket.create.mockResolvedValue(ticketBase)
    tx.auditEvent.create.mockResolvedValue({})
    prisma.auditEvent.create.mockResolvedValue({})
    prisma.ticket.count.mockResolvedValue(1)
  })

  it('creates a representative ticket with a daily atomic sequence', async () => {
    const result = await service.create(representative, {
      erId: 'er-1',
      entryChannel: EntryChannel.QR_CODE,
    })

    expect(result.code).toBe('A001')
    expect(result.currentPosition).toBe(1)
    expect(result.representative).toEqual({ fullName: 'Maria Teste' })
    expect(tx.representative.findUnique).toHaveBeenCalledWith({
      where: { id: 'rep-1' },
      select: { id: true, fullName: true },
    })
    expect(tx.queue.upsert).toHaveBeenCalled()
    expect(tx.ticket.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        queueId: 'queue-1',
        representativeId: 'rep-1',
        queuePosition: 1,
      }),
    })
    expect(tx.auditEvent.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({ eventType: 'ticket_creation_requested' }),
    })
    expect(tx.auditEvent.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({ eventType: 'duplicate_ticket_checked' }),
    })
    expect(tx.auditEvent.create).toHaveBeenNthCalledWith(3, {
      data: expect.objectContaining({ eventType: 'ticket_created' }),
    })
    expect(panel.emitToER).toHaveBeenCalledWith(
      'er-1',
      'ticket.created',
      expect.objectContaining({ code: 'A001' }),
    )
  })

  it('blocks an active duplicate before incrementing the sequence', async () => {
    tx.ticket.findFirst.mockResolvedValue({ code: 'A001' })

    await expect(
      service.create(representative, {
        erId: 'er-1',
        entryChannel: EntryChannel.QR_CODE,
      }),
    ).rejects.toThrow(ConflictException)
    expect(tx.queue.upsert).not.toHaveBeenCalled()
    expect(tx.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ eventType: 'duplicate_ticket_blocked' }),
    })
    expect(tx.ticket.findFirst).toHaveBeenCalledWith({
      where: {
        erId: 'er-1',
        representativeId: 'rep-1',
        state: {
          in: [
            TicketState.WAITING,
            TicketState.CALLING,
            TicketState.IN_SERVICE,
            TicketState.PAUSED,
          ],
        },
      },
      select: { code: true },
    })
  })

  it('records the authenticated attendant for assisted check-in', async () => {
    tx.representative.findUnique.mockResolvedValue({
      id: 'rep-2',
      fullName: 'Joana Teste',
    })
    tx.ticket.create.mockResolvedValue({
      ...ticketBase,
      representativeId: 'rep-2',
      entryChannel: EntryChannel.CHECKIN_ASSISTED,
      checkinAttendantId: 'att-1',
    })

    await service.create(attendant, {
      erId: 'er-1',
      entryChannel: EntryChannel.CHECKIN_ASSISTED,
      representativeId: 'rep-2',
    })

    expect(tx.ticket.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        representativeId: 'rep-2',
        checkinAttendantId: 'att-1',
      }),
    })
  })

  it('does not let a representative forge an assisted check-in', async () => {
    await expect(
      service.create(representative, {
        erId: 'er-1',
        entryChannel: EntryChannel.CHECKIN_ASSISTED,
        representativeId: 'rep-2',
      }),
    ).rejects.toThrow(ForbiddenException)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('rejects a legacy representative token without queue context', async () => {
    await expect(
      service.create(
        { userId: 'rep-1', role: Role.REPRESENTATIVE },
        { erId: 'er-1', entryChannel: EntryChannel.QR_CODE },
      ),
    ).rejects.toThrow('Acesso à fila inválido ou expirado')
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('rejects a representative token bound to another ER', async () => {
    await expect(
      service.create(
        { ...representative, erId: 'er-2', entryChannel: EntryChannel.QR_CODE },
        { erId: 'er-1', entryChannel: EntryChannel.QR_CODE },
      ),
    ).rejects.toThrow('O acesso à fila pertence a outro ER')
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('rejects a representative token bound to another entry channel', async () => {
    await expect(
      service.create(
        { ...representative, erId: 'er-1', entryChannel: EntryChannel.LINK },
        { erId: 'er-1', entryChannel: EntryChannel.QR_CODE },
      ),
    ).rejects.toThrow('O acesso à fila pertence a outro canal')
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('moves ticket and counter to IN_SERVICE in one transaction', async () => {
    prisma.ticket.findUnique.mockResolvedValue({
      ...ticketBase,
      state: TicketState.CALLING,
      counterId: 'counter-1',
      operatorId: 'op-1',
    })
    tx.ticket.updateMany.mockResolvedValue({ count: 1 })
    tx.counter.update.mockResolvedValue({ state: CounterState.IN_SERVICE })
    tx.ticket.findUniqueOrThrow.mockResolvedValue({
      ...ticketBase,
      state: TicketState.IN_SERVICE,
      counter: { number: 1 },
    })

    const result = await service.startService('ticket-1', operator)

    expect(result.state).toBe(TicketState.IN_SERVICE)
    expect(tx.counter.update).toHaveBeenCalledWith({
      where: { id: 'counter-1' },
      data: { state: CounterState.IN_SERVICE },
    })
    expect(panel.emitToER).toHaveBeenCalledWith(
      'er-1',
      'ticket.service_started',
      expect.objectContaining({ ticketId: 'ticket-1' }),
    )
  })

  it('rejects a manager from another ER', async () => {
    prisma.ticket.findUnique.mockResolvedValue(ticketBase)

    await expect(
      service.cancel('ticket-1', 'motivo', {
        ...manager,
        erId: 'er-2',
      }),
    ).rejects.toThrow(ForbiddenException)
  })

  it('does not let an operator cancel a ticket', async () => {
    await expect(service.cancel('ticket-1', 'motivo', operator)).rejects.toThrow(ForbiddenException)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('only restores NO_SHOW or pre-service CANCELLED tickets', async () => {
    prisma.ticket.findUnique.mockResolvedValue({
      ...ticketBase,
      state: TicketState.FINISHED,
    })
    tx.ticket.findFirst.mockResolvedValue(null)
    tx.ticket.updateMany.mockResolvedValue({ count: 0 })

    await expect(service.restore('ticket-1', 'motivo', manager)).rejects.toThrow(
      BadRequestException,
    )
  })

  it('restores a CANCELLED ticket that never entered service', async () => {
    prisma.ticket.findUnique.mockResolvedValue({
      ...ticketBase,
      state: TicketState.CANCELLED,
      serviceStartedAt: null,
      cancelledAt: new Date(),
      cancelReason: 'cadastro incorreto',
    })
    tx.ticket.findFirst.mockResolvedValue(null)
    tx.queue.upsert.mockResolvedValue({ id: 'queue-1', nextSequence: 7 })
    tx.ticket.updateMany.mockResolvedValue({ count: 1 })
    tx.ticket.findUniqueOrThrow.mockResolvedValue({
      ...ticketBase,
      state: TicketState.WAITING,
      queuePosition: 7,
    })

    const result = await service.restore('ticket-1', 'RE retornou', manager)

    expect(result.state).toBe(TicketState.WAITING)
    expect(tx.ticket.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'ticket-1',
        OR: [
          { state: TicketState.NO_SHOW },
          { state: TicketState.CANCELLED, serviceStartedAt: null },
        ],
      },
      data: expect.objectContaining({
        state: TicketState.WAITING,
        cancelledAt: null,
        cancelReason: null,
      }),
    })
    expect(tx.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: 'ticket_restored',
        metadata: expect.objectContaining({ fromState: TicketState.CANCELLED }),
      }),
    })
  })

  it('refuses to restore a CANCELLED ticket already started in service', async () => {
    prisma.ticket.findUnique.mockResolvedValue({
      ...ticketBase,
      state: TicketState.CANCELLED,
      serviceStartedAt: new Date(),
    })

    await expect(service.restore('ticket-1', 'motivo', manager)).rejects.toThrow(
      BadRequestException,
    )
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('blocks restore when the representative already has an active ticket', async () => {
    prisma.ticket.findUnique.mockResolvedValue({
      ...ticketBase,
      state: TicketState.NO_SHOW,
    })
    tx.ticket.findFirst.mockResolvedValue({ code: 'A099' })

    await expect(service.restore('ticket-1', 'motivo', manager)).rejects.toThrow(ConflictException)
    expect(tx.ticket.updateMany).not.toHaveBeenCalled()
  })

  it('finishes an IN_SERVICE ticket and resets the counter to ACTIVE', async () => {
    prisma.ticket.findUnique.mockResolvedValue({
      ...ticketBase,
      state: TicketState.IN_SERVICE,
      counterId: 'counter-1',
      operatorId: 'op-1',
    })
    tx.ticket.updateMany.mockResolvedValue({ count: 1 })
    tx.counter.update.mockResolvedValue({ state: CounterState.ACTIVE })
    tx.ticket.findUniqueOrThrow.mockResolvedValue({
      ...ticketBase,
      state: TicketState.FINISHED,
      serviceFinishedAt: new Date(),
    })

    const result = await service.finishService('ticket-1', operator)

    expect(result.state).toBe(TicketState.FINISHED)
    expect(tx.counter.update).toHaveBeenCalledWith({
      where: { id: 'counter-1' },
      data: { state: CounterState.ACTIVE },
    })
    expect(panel.emitToER).toHaveBeenCalledWith('er-1', 'ticket.service_finished', expect.any(Object))
  })

  it('marks a CALLING ticket as NO_SHOW and resets counter', async () => {
    prisma.ticket.findUnique.mockResolvedValue({
      ...ticketBase,
      state: TicketState.CALLING,
      counterId: 'counter-1',
      operatorId: 'op-1',
    })
    tx.ticket.updateMany.mockResolvedValue({ count: 1 })
    tx.counter.update.mockResolvedValue({ state: CounterState.ACTIVE })
    tx.ticket.findUniqueOrThrow.mockResolvedValue({ ...ticketBase, state: TicketState.NO_SHOW })

    const result = await service.noShow('ticket-1', operator)

    expect(result.state).toBe(TicketState.NO_SHOW)
    expect(tx.counter.update).toHaveBeenCalledWith({
      where: { id: 'counter-1' },
      data: { state: CounterState.ACTIVE },
    })
    expect(panel.emitToER).toHaveBeenCalledWith('er-1', 'ticket.no_show', expect.any(Object))
  })

  it('cancels an active ticket and resets the counter', async () => {
    const cancelledTicket = {
      ...ticketBase,
      state: TicketState.CANCELLED,
      cancelReason: 'duplicata',
      cancelledAt: new Date(),
      erId: 'er-1',
      code: 'A001',
    }
    prisma.ticket.findUnique.mockResolvedValue({ ...ticketBase, state: TicketState.WAITING })
    tx.ticket.findUnique.mockResolvedValue({ ...ticketBase, state: TicketState.WAITING })
    tx.ticket.update.mockResolvedValue(cancelledTicket)
    tx.auditEvent.create.mockResolvedValue({})

    const result = await service.cancel('ticket-1', 'duplicata', manager)

    expect(result.state).toBe(TicketState.CANCELLED)
    expect(tx.ticket.update).toHaveBeenCalledWith({
      where: { id: 'ticket-1' },
      data: expect.objectContaining({ state: TicketState.CANCELLED }),
    })
    expect(tx.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ eventType: 'ticket_cancelled' }),
    })
    expect(panel.emitToER).toHaveBeenCalledWith('er-1', 'ticket.cancelled', expect.any(Object))
  })

  it('restores a NO_SHOW ticket to WAITING at the end of the queue', async () => {
    prisma.ticket.findUnique.mockResolvedValue({
      ...ticketBase,
      state: TicketState.NO_SHOW,
      erId: 'er-1',
    })
    tx.queue.upsert.mockResolvedValue({ id: 'queue-1', nextSequence: 5 })
    tx.ticket.updateMany.mockResolvedValue({ count: 1 })
    tx.ticket.findUniqueOrThrow.mockResolvedValue({
      ...ticketBase,
      state: TicketState.WAITING,
      queuePosition: 5,
    })

    const result = await service.restore('ticket-1', 'gestor autorizou', manager)

    expect(result.state).toBe(TicketState.WAITING)
    expect(tx.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ eventType: 'ticket_restored' }),
    })
    expect(panel.emitToER).toHaveBeenCalledWith('er-1', 'ticket.restored', expect.any(Object))
  })

  describe('recall', () => {
    it('re-announces a CALLING ticket without changing the queue (second call)', async () => {
      prisma.ticket.findUnique.mockResolvedValue({
        ...ticketBase,
        state: TicketState.CALLING,
        counterId: 'counter-1',
        operatorId: 'op-1',
        calledAt: new Date(Date.now() - 60_000),
      })
      tx.ticket.updateMany.mockResolvedValue({ count: 1 })
      tx.ticket.findUniqueOrThrow.mockResolvedValue({
        ...ticketBase,
        state: TicketState.CALLING,
        counterId: 'counter-1',
        operatorId: 'op-1',
        calledAt: new Date(),
        representative: { fullName: 'Maria Teste' },
        counter: { number: 1 },
      })

      const result = await service.recall('ticket-1', operator)

      expect(result.state).toBe(TicketState.CALLING)
      expect(tx.ticket.updateMany).toHaveBeenCalledWith({
        where: { id: 'ticket-1', state: TicketState.CALLING, operatorId: 'op-1' },
        data: { calledAt: expect.any(Date) },
      })
      expect(tx.auditEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ eventType: 'ticket_recalled' }),
      })
      expect(panel.emitToER).toHaveBeenCalledWith(
        'er-1',
        'ticket.called',
        expect.objectContaining({ ticketId: 'ticket-1', counterNumber: 1 }),
      )
    })

    it('rejects recall of a ticket that is not CALLING', async () => {
      prisma.ticket.findUnique.mockResolvedValue({
        ...ticketBase,
        state: TicketState.WAITING,
        counterId: 'counter-1',
        operatorId: 'op-1',
      })
      tx.ticket.updateMany.mockResolvedValue({ count: 0 })

      await expect(service.recall('ticket-1', operator)).rejects.toThrow(BadRequestException)
    })

    it('does not let an operator recall a ticket assigned to another operator', async () => {
      prisma.ticket.findUnique.mockResolvedValue({
        ...ticketBase,
        state: TicketState.CALLING,
        counterId: 'counter-1',
        operatorId: 'another-op',
      })

      await expect(service.recall('ticket-1', operator)).rejects.toThrow(ForbiddenException)
      expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it('does not let a representative recall a ticket', async () => {
      await expect(service.recall('ticket-1', representative)).rejects.toThrow(ForbiddenException)
    })
  })

  it('supports audited manager correction of an open service', async () => {
    prisma.ticket.findUnique.mockResolvedValue({
      ...ticketBase,
      state: TicketState.IN_SERVICE,
      counterId: 'counter-1',
      operatorId: 'op-1',
    })
    tx.ticket.updateMany.mockResolvedValue({ count: 1 })
    tx.ticket.findUniqueOrThrow.mockResolvedValue({
      ...ticketBase,
      state: TicketState.FINISHED,
    })

    const result = await service.correct(
      'ticket-1',
      { action: CorrectionAction.FINISH, reason: 'Correção operacional' },
      manager,
    )

    expect(result.state).toBe(TicketState.FINISHED)
    expect(tx.auditEvent.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        eventType: 'manual_override_performed',
        metadata: expect.objectContaining({ action: 'FINISH' }),
      }),
    })
    expect(tx.auditEvent.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        eventType: 'service_finished',
        metadata: expect.objectContaining({ correction: true }),
      }),
    })
  })

  it('generates sequential display codes', () => {
    const generate = (service as unknown as { _generateCode: (sequence: number) => string })
      ._generateCode
    expect(generate(1)).toBe('A001')
    expect(generate(999)).toBe('A999')
    expect(generate(1000)).toBe('B001')
  })

  describe('pauseTicket', () => {
    it('transitions a WAITING ticket to PAUSED and records pausedAt', async () => {
      prisma.ticket.findUnique.mockResolvedValue(ticketBase)
      tx.ticket.updateMany.mockResolvedValue({ count: 1 })
      tx.ticket.findUniqueOrThrow.mockResolvedValue({
        ...ticketBase,
        state: TicketState.PAUSED,
        pausedAt: new Date(),
        representative: { fullName: 'Maria Teste' },
        er: { pauseTimeoutSeconds: 300 },
      })

      const result = await service.pauseTicket('ticket-1', 'rep-1')

      expect(tx.ticket.updateMany).toHaveBeenCalledWith({
        where: { id: 'ticket-1', state: TicketState.WAITING },
        data: expect.objectContaining({
          state: TicketState.PAUSED,
          pausedAt: expect.any(Date),
        }),
      })
      expect(tx.auditEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ eventType: 'ticket_paused' }),
      })
      expect(panel.emitToER).toHaveBeenCalledWith('er-1', 'ticket.paused', expect.objectContaining({ ticketId: 'ticket-1' }))
      expect(result.state).toBe(TicketState.PAUSED)
      expect(result.pauseTimeoutSeconds).toBe(300)
    })

    it('rejects pause if ticket belongs to another representative', async () => {
      prisma.ticket.findUnique.mockResolvedValue({ ...ticketBase, representativeId: 'rep-2' })

      await expect(service.pauseTicket('ticket-1', 'rep-1')).rejects.toThrow(ForbiddenException)
      expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it('rejects pause if ticket is not WAITING', async () => {
      prisma.ticket.findUnique.mockResolvedValue({ ...ticketBase, state: TicketState.CALLING })

      await expect(service.pauseTicket('ticket-1', 'rep-1')).rejects.toThrow(BadRequestException)
      expect(prisma.$transaction).not.toHaveBeenCalled()
    })
  })

  describe('resumeTicket', () => {
    const pausedAt = new Date(Date.now() - 120_000)

    it('transitions a PAUSED ticket back to WAITING, accumulates pausedSeconds and clears pausedAt', async () => {
      prisma.ticket.findUnique.mockResolvedValue({
        ...ticketBase,
        state: TicketState.PAUSED,
        pausedAt,
        pausedSeconds: 0,
      })
      tx.queue.upsert.mockResolvedValue({ id: 'queue-1', nextSequence: 5 })
      tx.ticket.updateMany.mockResolvedValue({ count: 1 })
      tx.ticket.findUniqueOrThrow.mockResolvedValue({
        ...ticketBase,
        state: TicketState.WAITING,
        code: 'A005',
        queuePosition: 5,
        pausedAt: null,
        pausedSeconds: 120,
        representative: { fullName: 'Maria Teste' },
      })
      prisma.ticket.count.mockResolvedValue(3)

      const result = await service.resumeTicket('ticket-1', 'rep-1')

      expect(tx.ticket.updateMany).toHaveBeenCalledWith({
        where: { id: 'ticket-1', state: TicketState.PAUSED },
        data: expect.objectContaining({
          state: TicketState.WAITING,
          pausedAt: null,
          pausedSeconds: expect.objectContaining({ increment: expect.any(Number) }),
        }),
      })
      const updateCall = tx.ticket.updateMany.mock.calls[0][0] as { data: { pausedSeconds: { increment: number } } }
      expect(updateCall.data.pausedSeconds.increment).toBeGreaterThanOrEqual(110)

      expect(tx.auditEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: 'ticket_resumed',
          metadata: expect.objectContaining({ pausedSeconds: expect.any(Number) }),
        }),
      })
      expect(panel.emitToER).toHaveBeenCalledWith('er-1', 'ticket.created', expect.objectContaining({ ticketId: 'ticket-1' }))
      expect(result.state).toBe(TicketState.WAITING)
      expect(result.code).toBe('A005')
      expect(result.currentPosition).toBe(3)
    })

    it('handles resume with null pausedAt (graceful: increments 0)', async () => {
      prisma.ticket.findUnique.mockResolvedValue({
        ...ticketBase,
        state: TicketState.PAUSED,
        pausedAt: null,
        pausedSeconds: 0,
      })
      tx.queue.upsert.mockResolvedValue({ id: 'queue-1', nextSequence: 2 })
      tx.ticket.updateMany.mockResolvedValue({ count: 1 })
      tx.ticket.findUniqueOrThrow.mockResolvedValue({
        ...ticketBase,
        state: TicketState.WAITING,
        code: 'A002',
        queuePosition: 2,
        pausedAt: null,
        pausedSeconds: 0,
        representative: { fullName: 'Maria Teste' },
      })
      prisma.ticket.count.mockResolvedValue(1)

      await service.resumeTicket('ticket-1', 'rep-1')

      const updateCall = tx.ticket.updateMany.mock.calls[0][0] as { data: { pausedSeconds: { increment: number } } }
      expect(updateCall.data.pausedSeconds.increment).toBe(0)
    })

    it('rejects resume if ticket belongs to another representative', async () => {
      prisma.ticket.findUnique.mockResolvedValue({
        ...ticketBase,
        state: TicketState.PAUSED,
        representativeId: 'rep-other',
      })

      await expect(service.resumeTicket('ticket-1', 'rep-1')).rejects.toThrow(ForbiddenException)
    })

    it('rejects resume if ticket is not PAUSED', async () => {
      prisma.ticket.findUnique.mockResolvedValue({ ...ticketBase, state: TicketState.WAITING })

      await expect(service.resumeTicket('ticket-1', 'rep-1')).rejects.toThrow(BadRequestException)
    })
  })

  describe('selfCancel', () => {
    it('cancels a WAITING ticket owned by the representative', async () => {
      tx.ticket.findUnique.mockResolvedValue(ticketBase)
      tx.ticket.update.mockResolvedValue({
        ...ticketBase,
        state: TicketState.CANCELLED,
        cancelReason: 'Desistência da representante',
        cancelledAt: new Date(),
      })

      const result = await service.selfCancel('ticket-1', 'rep-1')

      expect(tx.ticket.update).toHaveBeenCalledWith({
        where: { id: 'ticket-1' },
        data: expect.objectContaining({
          state: TicketState.CANCELLED,
          cancelReason: 'Desistência da representante',
        }),
      })
      expect(tx.auditEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: 'ticket_cancelled',
          metadata: expect.objectContaining({ selfCancelled: true }),
        }),
      })
      expect(panel.emitToER).toHaveBeenCalledWith('er-1', 'ticket.cancelled', expect.objectContaining({ ticketId: 'ticket-1' }))
      expect(result.state).toBe(TicketState.CANCELLED)
    })

    it('cancels a PAUSED ticket owned by the representative', async () => {
      tx.ticket.findUnique.mockResolvedValue({ ...ticketBase, state: TicketState.PAUSED })
      tx.ticket.update.mockResolvedValue({
        ...ticketBase,
        state: TicketState.CANCELLED,
      })

      await expect(service.selfCancel('ticket-1', 'rep-1')).resolves.not.toThrow()
    })

    it('rejects selfCancel if ticket belongs to another representative', async () => {
      tx.ticket.findUnique.mockResolvedValue({ ...ticketBase, representativeId: 'rep-other' })

      await expect(service.selfCancel('ticket-1', 'rep-1')).rejects.toThrow(ForbiddenException)
    })

    it('rejects selfCancel for a ticket in CALLING state', async () => {
      tx.ticket.findUnique.mockResolvedValue({ ...ticketBase, state: TicketState.CALLING })

      await expect(service.selfCancel('ticket-1', 'rep-1')).rejects.toThrow(BadRequestException)
    })

    it('rejects selfCancel for a ticket IN_SERVICE', async () => {
      tx.ticket.findUnique.mockResolvedValue({ ...ticketBase, state: TicketState.IN_SERVICE })

      await expect(service.selfCancel('ticket-1', 'rep-1')).rejects.toThrow(BadRequestException)
    })
  })
})
