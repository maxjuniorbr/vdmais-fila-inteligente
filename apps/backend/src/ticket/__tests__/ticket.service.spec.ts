import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common'
import {
  CounterState,
  EntryChannel,
  Prisma,
  RepresentativeKind,
  Role,
  TicketState,
} from '@prisma/client'
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
  isPriority: false,
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
  counter: { update: jest.fn(), updateMany: jest.fn() },
  auditEvent: { create: jest.fn() },
}

const prisma = {
  $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  eR: { findUnique: jest.fn() },
  counter: { findFirst: jest.fn() },
  ticket: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
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
      kind: RepresentativeKind.REGISTERED,
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
    // Defaults para os guards de staff-pause/resume: dia aberto e operadora com
    // caixa próprio ativo (id 'counter-1').
    prisma.eR.findUnique.mockResolvedValue({ isDayOpen: true })
    prisma.counter.findFirst.mockResolvedValue({ id: 'counter-1' })
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
      select: { id: true, fullName: true, kind: true },
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
      kind: RepresentativeKind.REGISTERED,
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
    expect(tx.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: 'queue_entry_started',
        erId: 'er-1',
        representativeId: 'rep-2',
        operatorId: 'att-1',
        metadata: { entryChannel: EntryChannel.CHECKIN_ASSISTED },
      }),
    })
  })

  it('lets an authenticated guest create her own ticket', async () => {
    tx.representative.findUnique.mockResolvedValue({
      id: 'rep-1',
      fullName: 'Convidada',
      kind: RepresentativeKind.GUEST,
    })

    const result = await service.create(representative, {
      erId: 'er-1',
      entryChannel: EntryChannel.QR_CODE,
    })

    expect(result.code).toBe('A001')
    expect(tx.ticket.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        representativeId: 'rep-1',
        checkinAttendantId: undefined,
      }),
    })
  })

  it('does not let assisted check-in create a ticket for a guest record', async () => {
    tx.representative.findUnique.mockResolvedValue({
      id: 'guest-1',
      fullName: 'Convidada',
      kind: RepresentativeKind.GUEST,
    })

    await expect(
      service.create(attendant, {
        erId: 'er-1',
        entryChannel: EntryChannel.CHECKIN_ASSISTED,
        representativeId: 'guest-1',
      }),
    ).rejects.toThrow('Representante não encontrada')
    expect(tx.ticket.create).not.toHaveBeenCalled()
  })

  it('honors isPriority from a staff assisted check-in and counts position priority-aware', async () => {
    tx.representative.findUnique.mockResolvedValue({
      id: 'rep-2',
      fullName: 'Joana Teste',
      kind: RepresentativeKind.REGISTERED,
    })
    tx.ticket.create.mockResolvedValue({
      ...ticketBase,
      representativeId: 'rep-2',
      entryChannel: EntryChannel.CHECKIN_ASSISTED,
      isPriority: true,
    })

    await service.create(attendant, {
      erId: 'er-1',
      entryChannel: EntryChannel.CHECKIN_ASSISTED,
      representativeId: 'rep-2',
      isPriority: true,
    })

    expect(tx.ticket.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ isPriority: true }),
    })
    // Senha preferencial só conta as preferenciais à frente dela.
    expect(tx.ticket.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        state: TicketState.WAITING,
        OR: [{ isPriority: true, queuePosition: { lte: 1 } }],
      }),
    })
  })

  it('forces isPriority to false when a representative self-creates a ticket', async () => {
    await service.create(representative, {
      erId: 'er-1',
      entryChannel: EntryChannel.QR_CODE,
      isPriority: true,
    })

    expect(tx.ticket.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ isPriority: false }),
    })
    // Senha normal fica atrás de todas as preferenciais.
    expect(tx.ticket.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        state: TicketState.WAITING,
        OR: [{ isPriority: true }, { isPriority: false, queuePosition: { lte: 1 } }],
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
    expect(panel.emitToER).toHaveBeenCalledWith(
      'er-1',
      'ticket.service_finished',
      expect.any(Object),
    )
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

  describe('integration M2M actions', () => {
    const ctx = { client: 'legacy-erp', scopes: ['tickets:start'], idempotencyKey: 'idem-1' }

    it('advanceToInService moves CALLING → IN_SERVICE without operator-ownership check', async () => {
      prisma.ticket.findUnique.mockResolvedValue({
        ...ticketBase,
        state: TicketState.CALLING,
        counterId: 'counter-1',
        operatorId: 'op-9',
      })
      tx.ticket.updateMany.mockResolvedValue({ count: 1 })
      tx.counter.update.mockResolvedValue({})
      tx.ticket.findUniqueOrThrow.mockResolvedValue({
        ...ticketBase,
        state: TicketState.IN_SERVICE,
        counter: { number: 1 },
        serviceStartedAt: new Date(),
      })

      const result = await service.advanceToInService('ticket-1', ctx)

      expect(result.idempotent).toBe(false)
      expect(result.ticket.state).toBe(TicketState.IN_SERVICE)
      expect(tx.ticket.updateMany).toHaveBeenCalledWith({
        where: { id: 'ticket-1', state: TicketState.CALLING },
        data: expect.objectContaining({ state: TicketState.IN_SERVICE }),
      })
      expect(tx.auditEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: 'service_started',
          operatorId: 'op-9',
          metadata: expect.objectContaining({
            source: 'integration',
            client: 'legacy-erp',
            scopes: ['tickets:start'],
            idempotencyKey: 'idem-1',
          }),
        }),
      })
    })

    it('advanceToInService is idempotent when already IN_SERVICE', async () => {
      prisma.ticket.findUnique.mockResolvedValue({
        ...ticketBase,
        state: TicketState.IN_SERVICE,
        counterId: 'counter-1',
        operatorId: 'op-9',
      })

      const result = await service.advanceToInService('ticket-1', ctx)

      expect(result.idempotent).toBe(true)
      expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it('advanceToInService rejects a WAITING ticket as TICKET_NOT_CALLED', async () => {
      prisma.ticket.findUnique.mockResolvedValue({ ...ticketBase, state: TicketState.WAITING })
      const err = await service.advanceToInService('ticket-1', ctx).catch((e) => e)
      expect(err).toBeInstanceOf(ConflictException)
      expect(err.getResponse()).toMatchObject({ code: 'TICKET_NOT_CALLED' })
    })

    it('advanceToInService rejects a closed ticket as TICKET_ALREADY_CLOSED', async () => {
      prisma.ticket.findUnique.mockResolvedValue({ ...ticketBase, state: TicketState.FINISHED })
      const err = await service.advanceToInService('ticket-1', ctx).catch((e) => e)
      expect(err.getResponse()).toMatchObject({ code: 'TICKET_ALREADY_CLOSED' })
    })

    it('advanceToInService rejects a CALLING ticket without counter (defensive)', async () => {
      prisma.ticket.findUnique.mockResolvedValue({
        ...ticketBase,
        state: TicketState.CALLING,
        counterId: null,
      })
      const err = await service.advanceToInService('ticket-1', ctx).catch((e) => e)
      expect(err.getResponse()).toMatchObject({ code: 'TICKET_NOT_CALLED' })
    })

    it('completeService moves IN_SERVICE → FINISHED', async () => {
      prisma.ticket.findUnique.mockResolvedValue({
        ...ticketBase,
        state: TicketState.IN_SERVICE,
        counterId: 'counter-1',
        operatorId: 'op-9',
      })
      tx.ticket.updateMany.mockResolvedValue({ count: 1 })
      tx.counter.update.mockResolvedValue({})
      tx.ticket.findUniqueOrThrow.mockResolvedValue({
        ...ticketBase,
        state: TicketState.FINISHED,
        serviceFinishedAt: new Date(),
      })

      const result = await service.completeService('ticket-1', {
        client: 'legacy',
        scopes: ['tickets:finish'],
      })

      expect(result.idempotent).toBe(false)
      expect(result.ticket.state).toBe(TicketState.FINISHED)
      expect(tx.ticket.updateMany).toHaveBeenCalledWith({
        where: { id: 'ticket-1', state: TicketState.IN_SERVICE },
        data: expect.objectContaining({ state: TicketState.FINISHED }),
      })
      expect(tx.counter.update).toHaveBeenCalledWith({
        where: { id: 'counter-1' },
        data: { state: CounterState.ACTIVE },
      })
    })

    it('completeService is idempotent when already FINISHED', async () => {
      prisma.ticket.findUnique.mockResolvedValue({ ...ticketBase, state: TicketState.FINISHED })

      const result = await service.completeService('ticket-1', {})

      expect(result.idempotent).toBe(true)
      expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it('completeService rejects a CALLING ticket as TICKET_NOT_IN_SERVICE', async () => {
      prisma.ticket.findUnique.mockResolvedValue({
        ...ticketBase,
        state: TicketState.CALLING,
        counterId: 'counter-1',
      })
      const err = await service.completeService('ticket-1', {}).catch((e) => e)
      expect(err.getResponse()).toMatchObject({ code: 'TICKET_NOT_IN_SERVICE' })
    })

    it('completeService rejects a cancelled ticket as TICKET_ALREADY_CLOSED', async () => {
      prisma.ticket.findUnique.mockResolvedValue({ ...ticketBase, state: TicketState.CANCELLED })
      const err = await service.completeService('ticket-1', {}).catch((e) => e)
      expect(err.getResponse()).toMatchObject({ code: 'TICKET_ALREADY_CLOSED' })
    })

    it('completeService rejects an IN_SERVICE ticket without a counter as TICKET_NOT_IN_SERVICE', async () => {
      prisma.ticket.findUnique.mockResolvedValue({
        ...ticketBase,
        state: TicketState.IN_SERVICE,
        counterId: null,
      })
      const err = await service.completeService('ticket-1', {}).catch((e) => e)
      expect(err.getResponse()).toMatchObject({ code: 'TICKET_NOT_IN_SERVICE' })
    })

    it('advanceToInService is idempotent when a concurrent call wins the transition (race)', async () => {
      prisma.ticket.findUnique
        .mockResolvedValueOnce({
          ...ticketBase,
          state: TicketState.CALLING,
          counterId: 'counter-1',
          operatorId: 'op-9',
        })
        .mockResolvedValueOnce({
          ...ticketBase,
          state: TicketState.IN_SERVICE,
          counterId: 'counter-1',
          operatorId: 'op-9',
        })
      tx.ticket.updateMany.mockResolvedValue({ count: 0 })

      const result = await service.advanceToInService('ticket-1', ctx)

      expect(result.idempotent).toBe(true)
      expect(result.ticket.state).toBe(TicketState.IN_SERVICE)
    })

    it('advanceToInService rethrows when the race left a non-target state', async () => {
      prisma.ticket.findUnique
        .mockResolvedValueOnce({
          ...ticketBase,
          state: TicketState.CALLING,
          counterId: 'counter-1',
          operatorId: 'op-9',
        })
        .mockResolvedValueOnce({
          ...ticketBase,
          state: TicketState.CANCELLED,
          counterId: 'counter-1',
        })
      tx.ticket.updateMany.mockResolvedValue({ count: 0 })

      await expect(service.advanceToInService('ticket-1', ctx)).rejects.toThrow(BadRequestException)
    })

    it('completeService is idempotent when a concurrent call wins the finish (race)', async () => {
      prisma.ticket.findUnique
        .mockResolvedValueOnce({
          ...ticketBase,
          state: TicketState.IN_SERVICE,
          counterId: 'counter-1',
          operatorId: 'op-9',
        })
        .mockResolvedValueOnce({
          ...ticketBase,
          state: TicketState.FINISHED,
          counterId: 'counter-1',
        })
      tx.ticket.updateMany.mockResolvedValue({ count: 0 })

      const result = await service.completeService('ticket-1', {})

      expect(result.idempotent).toBe(true)
      expect(result.ticket.state).toBe(TicketState.FINISHED)
    })
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

  it('frees the counter when cancelling a ticket parked at one', async () => {
    prisma.ticket.findUnique.mockResolvedValue({ ...ticketBase, state: TicketState.IN_SERVICE })
    tx.ticket.findUnique.mockResolvedValue({
      ...ticketBase,
      state: TicketState.IN_SERVICE,
      counterId: 'counter-1',
    })
    tx.ticket.update.mockResolvedValue({ ...ticketBase, state: TicketState.CANCELLED })

    await service.cancel('ticket-1', 'duplicata', manager)

    expect(tx.counter.update).toHaveBeenCalledWith({
      where: { id: 'counter-1' },
      data: { state: CounterState.ACTIVE },
    })
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
      expect(tx.auditEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: 'ticket_call_displayed_on_panel',
          erId: 'er-1',
          ticketId: 'ticket-1',
          metadata: expect.objectContaining({ counterNumber: 1, via: 'recall' }),
        }),
      })
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
        er: { pauseTimeoutSeconds: 300, callTimeoutSeconds: 600 },
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
      expect(panel.emitToER).toHaveBeenCalledWith(
        'er-1',
        'ticket.paused',
        expect.objectContaining({ ticketId: 'ticket-1' }),
      )
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

    it('resumes a PAUSED ticket in place, keeping position/code and accumulating pausedSeconds', async () => {
      prisma.ticket.findUnique.mockResolvedValue({
        ...ticketBase,
        state: TicketState.PAUSED,
        pausedAt,
        pausedSeconds: 0,
      })
      tx.ticket.updateMany.mockResolvedValue({ count: 1 })
      tx.ticket.findUniqueOrThrow.mockResolvedValue({
        ...ticketBase,
        state: TicketState.WAITING,
        pausedAt: null,
        pausedSeconds: 120,
        representative: { fullName: 'Maria Teste' },
      })
      prisma.ticket.count.mockResolvedValue(3)

      const result = await service.resumeTicket('ticket-1', 'rep-1')

      // Retomada no lugar: não cria/incrementa a fila nem reatribui posição/código.
      expect(tx.queue.upsert).not.toHaveBeenCalled()
      expect(tx.ticket.updateMany).toHaveBeenCalledWith({
        where: { id: 'ticket-1', state: TicketState.PAUSED },
        data: expect.objectContaining({
          state: TicketState.WAITING,
          pausedAt: null,
          pausedSeconds: expect.objectContaining({ increment: expect.any(Number) }),
        }),
      })
      const updateCall = tx.ticket.updateMany.mock.calls[0][0] as {
        data: { pausedSeconds: { increment: number } }
      }
      expect(updateCall.data).not.toHaveProperty('queuePosition')
      expect(updateCall.data).not.toHaveProperty('code')
      expect(updateCall.data.pausedSeconds.increment).toBeGreaterThanOrEqual(110)

      expect(tx.auditEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: 'ticket_resumed',
          metadata: expect.objectContaining({ inPlace: true, pausedSeconds: expect.any(Number) }),
        }),
      })
      expect(panel.emitToER).toHaveBeenCalledWith(
        'er-1',
        'ticket.created',
        expect.objectContaining({ ticketId: 'ticket-1' }),
      )
      expect(result.state).toBe(TicketState.WAITING)
      expect(result.code).toBe('A001')
      expect(result.queuePosition).toBe(1)
      expect(result.currentPosition).toBe(3)
    })

    it('handles resume with null pausedAt (graceful: increments 0)', async () => {
      prisma.ticket.findUnique.mockResolvedValue({
        ...ticketBase,
        state: TicketState.PAUSED,
        pausedAt: null,
        pausedSeconds: 0,
      })
      tx.ticket.updateMany.mockResolvedValue({ count: 1 })
      tx.ticket.findUniqueOrThrow.mockResolvedValue({
        ...ticketBase,
        state: TicketState.WAITING,
        pausedAt: null,
        pausedSeconds: 0,
        representative: { fullName: 'Maria Teste' },
      })
      prisma.ticket.count.mockResolvedValue(1)

      await service.resumeTicket('ticket-1', 'rep-1')

      const updateCall = tx.ticket.updateMany.mock.calls[0][0] as {
        data: { pausedSeconds: { increment: number } }
      }
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

  describe('staffPauseTicket', () => {
    it('pauses a WAITING ticket without touching any counter', async () => {
      prisma.ticket.findUnique.mockResolvedValue({ ...ticketBase, state: TicketState.WAITING })
      tx.ticket.updateMany.mockResolvedValue({ count: 1 })
      tx.ticket.findUniqueOrThrow.mockResolvedValue({
        ...ticketBase,
        state: TicketState.PAUSED,
        representative: { fullName: 'Maria Teste' },
        er: { pauseTimeoutSeconds: 300 },
      })

      const result = await service.staffPauseTicket('ticket-1', operator)

      expect(tx.ticket.updateMany).toHaveBeenCalledWith({
        where: { id: 'ticket-1', state: TicketState.WAITING },
        data: expect.objectContaining({
          state: TicketState.PAUSED,
          counterId: null,
          operatorId: null,
        }),
      })
      expect(tx.counter.updateMany).not.toHaveBeenCalled()
      expect(tx.auditEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: 'ticket_paused',
          operatorId: 'op-1',
          metadata: expect.objectContaining({ byStaff: true, fromState: TicketState.WAITING }),
        }),
      })
      expect(panel.emitToER).toHaveBeenCalledWith(
        'er-1',
        'ticket.paused',
        expect.objectContaining({ ticketId: 'ticket-1' }),
      )
      expect(result.state).toBe(TicketState.PAUSED)
      expect(result.pauseTimeoutSeconds).toBe(300)
    })

    it('pauses a CALLING ticket and frees its counter', async () => {
      prisma.ticket.findUnique.mockResolvedValue({
        ...ticketBase,
        state: TicketState.CALLING,
        counterId: 'counter-1',
        operatorId: 'op-1',
        calledAt: new Date(),
      })
      tx.ticket.updateMany.mockResolvedValue({ count: 1 })
      tx.counter.updateMany.mockResolvedValue({ count: 1 })
      tx.ticket.findUniqueOrThrow.mockResolvedValue({
        ...ticketBase,
        state: TicketState.PAUSED,
        representative: { fullName: 'Maria Teste' },
        er: { pauseTimeoutSeconds: 300 },
      })

      await service.staffPauseTicket('ticket-1', operator)

      expect(tx.ticket.updateMany).toHaveBeenCalledWith({
        where: { id: 'ticket-1', state: TicketState.CALLING },
        data: expect.objectContaining({
          state: TicketState.PAUSED,
          counterId: null,
          operatorId: null,
          calledAt: null,
          serviceStartedAt: null,
        }),
      })
      expect(tx.counter.updateMany).toHaveBeenCalledWith({
        where: { id: 'counter-1', state: { in: [CounterState.CALLING, CounterState.IN_SERVICE] } },
        data: { state: CounterState.ACTIVE },
      })
    })

    it('pauses an IN_SERVICE ticket, frees the counter and emits no service_finished', async () => {
      prisma.ticket.findUnique.mockResolvedValue({
        ...ticketBase,
        state: TicketState.IN_SERVICE,
        counterId: 'counter-1',
        operatorId: 'op-1',
        serviceStartedAt: new Date(),
      })
      tx.ticket.updateMany.mockResolvedValue({ count: 1 })
      tx.counter.updateMany.mockResolvedValue({ count: 1 })
      tx.ticket.findUniqueOrThrow.mockResolvedValue({
        ...ticketBase,
        state: TicketState.PAUSED,
        representative: { fullName: 'Maria Teste' },
        er: { pauseTimeoutSeconds: 300 },
      })

      await service.staffPauseTicket('ticket-1', operator)

      expect(tx.counter.updateMany).toHaveBeenCalledWith({
        where: { id: 'counter-1', state: { in: [CounterState.CALLING, CounterState.IN_SERVICE] } },
        data: { state: CounterState.ACTIVE },
      })
      const auditedTypes = tx.auditEvent.create.mock.calls.map((call) => call[0].data.eventType)
      expect(auditedTypes).not.toContain('service_finished')
      expect(auditedTypes).not.toContain('service_force_finished')
    })

    it('rejects pausing a ticket that is not waiting/calling/in-service', async () => {
      prisma.ticket.findUnique.mockResolvedValue({ ...ticketBase, state: TicketState.FINISHED })
      await expect(service.staffPauseTicket('ticket-1', operator)).rejects.toThrow(
        BadRequestException,
      )
    })

    it('rejects an operator from another ER', async () => {
      prisma.ticket.findUnique.mockResolvedValue({
        ...ticketBase,
        state: TicketState.WAITING,
        erId: 'er-2',
      })
      await expect(service.staffPauseTicket('ticket-1', operator)).rejects.toThrow(
        ForbiddenException,
      )
    })

    it('rejects an operator whose counter is paused or absent (no active counter)', async () => {
      prisma.ticket.findUnique.mockResolvedValue({ ...ticketBase, state: TicketState.WAITING })
      prisma.counter.findFirst.mockResolvedValue(null)
      await expect(service.staffPauseTicket('ticket-1', operator)).rejects.toThrow(
        BadRequestException,
      )
    })

    it('rejects pausing a ticket parked at another operator counter', async () => {
      prisma.ticket.findUnique.mockResolvedValue({
        ...ticketBase,
        state: TicketState.IN_SERVICE,
        counterId: 'counter-2',
      })
      prisma.counter.findFirst.mockResolvedValue({ id: 'counter-1' })
      await expect(service.staffPauseTicket('ticket-1', operator)).rejects.toThrow(
        ForbiddenException,
      )
    })

    it('lets a MANAGER pause a ticket parked at another operator counter (cross-counter)', async () => {
      prisma.ticket.findUnique.mockResolvedValue({
        ...ticketBase,
        state: TicketState.IN_SERVICE,
        counterId: 'counter-2',
        operatorId: 'op-1',
        serviceStartedAt: new Date(),
      })
      tx.ticket.updateMany.mockResolvedValue({ count: 1 })
      tx.counter.updateMany.mockResolvedValue({ count: 1 })
      tx.ticket.findUniqueOrThrow.mockResolvedValue({
        ...ticketBase,
        state: TicketState.PAUSED,
        representative: { fullName: 'Maria Teste' },
        er: { pauseTimeoutSeconds: 300 },
      })

      await expect(service.staffPauseTicket('ticket-1', manager)).resolves.toBeTruthy()
      // A gestora não opera caixa: não passa pela checagem de posse de caixa.
      expect(prisma.counter.findFirst).not.toHaveBeenCalled()
      expect(tx.counter.updateMany).toHaveBeenCalledWith({
        where: { id: 'counter-2', state: { in: [CounterState.CALLING, CounterState.IN_SERVICE] } },
        data: { state: CounterState.ACTIVE },
      })
    })

    it('rejects pausing when the daily operation is closed', async () => {
      prisma.ticket.findUnique.mockResolvedValue({ ...ticketBase, state: TicketState.WAITING })
      prisma.eR.findUnique.mockResolvedValue({ isDayOpen: false })
      await expect(service.staffPauseTicket('ticket-1', operator)).rejects.toThrow(
        BadRequestException,
      )
    })

    it('lets an ADMIN pause without owning a counter', async () => {
      prisma.ticket.findUnique.mockResolvedValue({ ...ticketBase, state: TicketState.WAITING })
      prisma.counter.findFirst.mockResolvedValue(null)
      tx.ticket.updateMany.mockResolvedValue({ count: 1 })
      tx.ticket.findUniqueOrThrow.mockResolvedValue({
        ...ticketBase,
        state: TicketState.PAUSED,
        representative: { fullName: 'Maria Teste' },
        er: { pauseTimeoutSeconds: 300 },
      })

      const admin = { userId: 'admin-1', role: Role.ADMIN, erId: undefined }
      await expect(service.staffPauseTicket('ticket-1', admin)).resolves.toBeTruthy()
      expect(prisma.counter.findFirst).not.toHaveBeenCalled()
    })

    it('rejects staff-pause when the ticket already moved (CAS finds no row)', async () => {
      prisma.ticket.findUnique.mockResolvedValue({ ...ticketBase, state: TicketState.WAITING })
      tx.ticket.updateMany.mockResolvedValue({ count: 0 })
      await expect(service.staffPauseTicket('ticket-1', operator)).rejects.toThrow(
        BadRequestException,
      )
    })
  })

  describe('staffResumeTicket', () => {
    it('resumes a PAUSED ticket in place without an ownership check', async () => {
      prisma.ticket.findUnique.mockResolvedValue({
        ...ticketBase,
        state: TicketState.PAUSED,
        representativeId: 'rep-other',
        pausedAt: new Date(Date.now() - 60_000),
      })
      tx.ticket.updateMany.mockResolvedValue({ count: 1 })
      tx.ticket.findUniqueOrThrow.mockResolvedValue({
        ...ticketBase,
        state: TicketState.WAITING,
        pausedAt: null,
        representative: { fullName: 'Maria Teste' },
      })
      prisma.ticket.count.mockResolvedValue(2)

      const result = await service.staffResumeTicket('ticket-1', operator)

      expect(tx.queue.upsert).not.toHaveBeenCalled()
      expect(tx.ticket.updateMany.mock.calls[0][0].data).not.toHaveProperty('queuePosition')
      expect(tx.auditEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: 'ticket_resumed',
          operatorId: 'op-1',
          metadata: expect.objectContaining({ byStaff: true, inPlace: true }),
        }),
      })
      expect(panel.emitToER).toHaveBeenCalledWith(
        'er-1',
        'ticket.created',
        expect.objectContaining({ ticketId: 'ticket-1' }),
      )
      expect(result.state).toBe(TicketState.WAITING)
      expect(result.queuePosition).toBe(1)
    })

    it('lets a MANAGER resume a paused ticket without owning a counter', async () => {
      prisma.ticket.findUnique.mockResolvedValue({
        ...ticketBase,
        state: TicketState.PAUSED,
        representativeId: 'rep-other',
        pausedAt: new Date(Date.now() - 60_000),
      })
      // No active counter for the actor: an OPERATOR would be rejected here, so a
      // successful resume proves the MANAGER skips the counter-ownership check.
      prisma.counter.findFirst.mockResolvedValue(null)
      tx.ticket.updateMany.mockResolvedValue({ count: 1 })
      tx.ticket.findUniqueOrThrow.mockResolvedValue({
        ...ticketBase,
        state: TicketState.WAITING,
        pausedAt: null,
        representative: { fullName: 'Maria Teste' },
      })
      prisma.ticket.count.mockResolvedValue(2)

      await expect(service.staffResumeTicket('ticket-1', manager)).resolves.toBeTruthy()
      expect(prisma.counter.findFirst).not.toHaveBeenCalled()
    })

    // Senha PREFERENCIAL retomada mantém a prioridade e a posição original.
    it('keeps isPriority and position when resuming a preferential ticket', async () => {
      prisma.ticket.findUnique.mockResolvedValue({
        ...ticketBase,
        state: TicketState.PAUSED,
        isPriority: true,
        pausedAt: new Date(Date.now() - 60_000),
      })
      tx.ticket.updateMany.mockResolvedValue({ count: 1 })
      tx.ticket.findUniqueOrThrow.mockResolvedValue({
        ...ticketBase,
        state: TicketState.WAITING,
        isPriority: true,
        pausedAt: null,
        representative: { fullName: 'Maria Teste' },
      })
      prisma.ticket.count.mockResolvedValue(2)

      const result = await service.staffResumeTicket('ticket-1', operator)

      const data = tx.ticket.updateMany.mock.calls[0][0].data
      expect(data).not.toHaveProperty('isPriority')
      expect(data).not.toHaveProperty('queuePosition')
      expect(result.isPriority).toBe(true)
      expect(result.queuePosition).toBe(1)
    })

    // Senha NORMAL retomada continua normal e na posição original.
    it('keeps a normal ticket normal and in place when resuming', async () => {
      prisma.ticket.findUnique.mockResolvedValue({
        ...ticketBase,
        state: TicketState.PAUSED,
        isPriority: false,
        pausedAt: new Date(Date.now() - 60_000),
      })
      tx.ticket.updateMany.mockResolvedValue({ count: 1 })
      tx.ticket.findUniqueOrThrow.mockResolvedValue({
        ...ticketBase,
        state: TicketState.WAITING,
        isPriority: false,
        pausedAt: null,
        representative: { fullName: 'Maria Teste' },
      })
      prisma.ticket.count.mockResolvedValue(3)

      const result = await service.staffResumeTicket('ticket-1', operator)

      const data = tx.ticket.updateMany.mock.calls[0][0].data
      expect(data).not.toHaveProperty('isPriority')
      expect(data).not.toHaveProperty('queuePosition')
      expect(result.isPriority).toBe(false)
      expect(result.queuePosition).toBe(1)
    })

    it('rejects resuming a ticket that is not paused', async () => {
      prisma.ticket.findUnique.mockResolvedValue({ ...ticketBase, state: TicketState.WAITING })
      await expect(service.staffResumeTicket('ticket-1', operator)).rejects.toThrow(
        BadRequestException,
      )
    })

    it('rejects an operator from another ER', async () => {
      prisma.ticket.findUnique.mockResolvedValue({
        ...ticketBase,
        state: TicketState.PAUSED,
        erId: 'er-2',
      })
      await expect(service.staffResumeTicket('ticket-1', operator)).rejects.toThrow(
        ForbiddenException,
      )
    })

    it('rejects resuming when the daily operation is closed', async () => {
      prisma.ticket.findUnique.mockResolvedValue({ ...ticketBase, state: TicketState.PAUSED })
      prisma.eR.findUnique.mockResolvedValue({ isDayOpen: false })
      await expect(service.staffResumeTicket('ticket-1', operator)).rejects.toThrow(
        BadRequestException,
      )
    })

    it('rejects an operator without an active counter', async () => {
      prisma.ticket.findUnique.mockResolvedValue({ ...ticketBase, state: TicketState.PAUSED })
      prisma.eR.findUnique.mockResolvedValue({ isDayOpen: true })
      prisma.counter.findFirst.mockResolvedValue(null)
      await expect(service.staffResumeTicket('ticket-1', operator)).rejects.toThrow(
        BadRequestException,
      )
    })
  })

  describe('setTicketPriority', () => {
    const priorityView = {
      ...ticketBase,
      isPriority: true,
      state: TicketState.WAITING,
      representative: { fullName: 'Maria Teste' },
      er: { pauseTimeoutSeconds: 300, callTimeoutSeconds: 600 },
    }

    it('marks a WAITING ticket as preferential, audits and emits', async () => {
      prisma.ticket.findUnique.mockResolvedValue({ ...ticketBase, state: TicketState.WAITING })
      tx.ticket.updateMany.mockResolvedValue({ count: 1 })
      tx.ticket.findUniqueOrThrow.mockResolvedValue(priorityView)

      const result = await service.setTicketPriority('ticket-1', true, operator)

      // CAS exige o valor oposto (isPriority: false) para não reaplicar às cegas.
      expect(tx.ticket.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'ticket-1',
          state: { in: [TicketState.WAITING, TicketState.PAUSED] },
          isPriority: false,
        },
        data: { isPriority: true },
      })
      expect(tx.auditEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: 'ticket_priority_changed',
          operatorId: 'op-1',
          metadata: expect.objectContaining({ isPriority: true, byStaff: true }),
        }),
      })
      expect(panel.emitToER).toHaveBeenCalledWith('er-1', 'ticket.priority_changed', {
        ticketId: 'ticket-1',
        isPriority: true,
      })
      expect(result.isPriority).toBe(true)
    })

    it('unmarks priority on a PAUSED ticket that is currently preferential', async () => {
      prisma.ticket.findUnique.mockResolvedValue({
        ...ticketBase,
        state: TicketState.PAUSED,
        isPriority: true,
      })
      tx.ticket.updateMany.mockResolvedValue({ count: 1 })
      tx.ticket.findUniqueOrThrow.mockResolvedValue({
        ...priorityView,
        isPriority: false,
        state: TicketState.PAUSED,
      })

      await service.setTicketPriority('ticket-1', false, operator)

      expect(tx.ticket.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'ticket-1',
          state: { in: [TicketState.WAITING, TicketState.PAUSED] },
          isPriority: true,
        },
        data: { isPriority: false },
      })
      expect(panel.emitToER).toHaveBeenCalledWith('er-1', 'ticket.priority_changed', {
        ticketId: 'ticket-1',
        isPriority: false,
      })
    })

    it('rejects marking a ticket that is already preferential (no event, no audit)', async () => {
      prisma.ticket.findUnique.mockResolvedValue({
        ...ticketBase,
        state: TicketState.WAITING,
        isPriority: true,
      })
      await expect(service.setTicketPriority('ticket-1', true, operator)).rejects.toThrow(
        BadRequestException,
      )
      expect(prisma.$transaction).not.toHaveBeenCalled()
      expect(panel.emitToER).not.toHaveBeenCalled()
    })

    it('rejects unmarking a ticket that is already normal', async () => {
      prisma.ticket.findUnique.mockResolvedValue({
        ...ticketBase,
        state: TicketState.WAITING,
        isPriority: false,
      })
      await expect(service.setTicketPriority('ticket-1', false, operator)).rejects.toThrow(
        BadRequestException,
      )
      expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it('rejects changing priority of a ticket that is not waiting or paused', async () => {
      prisma.ticket.findUnique.mockResolvedValue({ ...ticketBase, state: TicketState.IN_SERVICE })
      await expect(service.setTicketPriority('ticket-1', true, operator)).rejects.toThrow(
        BadRequestException,
      )
      expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it('rejects an operator from another ER', async () => {
      prisma.ticket.findUnique.mockResolvedValue({
        ...ticketBase,
        state: TicketState.WAITING,
        erId: 'er-2',
      })
      await expect(service.setTicketPriority('ticket-1', true, operator)).rejects.toThrow(
        ForbiddenException,
      )
    })

    // Corrida: a leitura inicial vê a senha como normal, mas outra operadora já a
    // marcou preferencial antes da escrita (CAS bate count 0). A mensagem deve ser a
    // específica de "já está no valor", não a genérica.
    it('returns the "already preferential" message on a same-direction race (CAS miss)', async () => {
      prisma.ticket.findUnique.mockResolvedValue({
        ...ticketBase,
        state: TicketState.WAITING,
        isPriority: false,
      })
      tx.ticket.updateMany.mockResolvedValue({ count: 0 })
      tx.ticket.findUnique.mockResolvedValue({ isPriority: true })

      await expect(service.setTicketPriority('ticket-1', true, operator)).rejects.toThrow(
        'A senha já é preferencial',
      )
    })

    // CAS bate count 0 porque a senha saiu de WAITING/PAUSED (ex.: foi chamada) entre
    // a leitura e a escrita — aí a mensagem genérica é a correta.
    it('returns the generic message when the CAS miss is due to a state change', async () => {
      prisma.ticket.findUnique.mockResolvedValue({
        ...ticketBase,
        state: TicketState.WAITING,
        isPriority: false,
      })
      tx.ticket.updateMany.mockResolvedValue({ count: 0 })
      tx.ticket.findUnique.mockResolvedValue({ isPriority: false })

      await expect(service.setTicketPriority('ticket-1', true, operator)).rejects.toThrow(
        'Não foi possível alterar a prioridade da senha',
      )
    })
  })

  describe('selfCancel', () => {
    it('cancels a WAITING ticket owned by the representative', async () => {
      tx.ticket.findUnique.mockResolvedValue(ticketBase)
      tx.ticket.updateMany.mockResolvedValue({ count: 1 })
      tx.ticket.findUniqueOrThrow.mockResolvedValue({
        ...ticketBase,
        state: TicketState.CANCELLED,
        cancelReason: 'Desistência da representante',
        cancelledAt: new Date(),
      })

      const result = await service.selfCancel('ticket-1', 'rep-1')

      // Locks the row and guards the state in the write to avoid clobbering a
      // concurrent callNext (WAITING → CALLING).
      expect(tx.$queryRaw).toHaveBeenCalled()
      expect(tx.ticket.updateMany).toHaveBeenCalledWith({
        where: { id: 'ticket-1', state: { in: [TicketState.WAITING, TicketState.PAUSED] } },
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
      expect(panel.emitToER).toHaveBeenCalledWith(
        'er-1',
        'ticket.cancelled',
        expect.objectContaining({ ticketId: 'ticket-1' }),
      )
      expect(result.state).toBe(TicketState.CANCELLED)
    })

    it('cancels a PAUSED ticket owned by the representative', async () => {
      tx.ticket.findUnique.mockResolvedValue({ ...ticketBase, state: TicketState.PAUSED })
      tx.ticket.updateMany.mockResolvedValue({ count: 1 })
      tx.ticket.findUniqueOrThrow.mockResolvedValue({
        ...ticketBase,
        state: TicketState.CANCELLED,
      })

      await expect(service.selfCancel('ticket-1', 'rep-1')).resolves.not.toThrow()
    })

    it('rejects when the row was already moved out of WAITING/PAUSED concurrently', async () => {
      tx.ticket.findUnique.mockResolvedValue(ticketBase)
      // The guarded updateMany matches nothing because callNext already advanced it.
      tx.ticket.updateMany.mockResolvedValue({ count: 0 })

      await expect(service.selfCancel('ticket-1', 'rep-1')).rejects.toThrow(BadRequestException)
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

  describe('guards and error paths', () => {
    const admin = { userId: 'adm-1', role: Role.ADMIN, erId: undefined }

    it('rejects create when the ER does not exist', async () => {
      tx.eR.findUnique.mockResolvedValue(null)

      await expect(
        service.create(representative, { erId: 'er-1', entryChannel: EntryChannel.QR_CODE }),
      ).rejects.toThrow('ER não encontrado')
    })

    it('rejects a representative entering through the assisted check-in channel', async () => {
      await expect(
        service.create(
          { ...representative, entryChannel: EntryChannel.CHECKIN_ASSISTED },
          { erId: 'er-1', entryChannel: EntryChannel.CHECKIN_ASSISTED },
        ),
      ).rejects.toThrow('O check-in assistido requer uma atendente')
    })

    it('rejects an attendant creating a ticket outside the assisted channel', async () => {
      await expect(
        service.create(attendant, { erId: 'er-1', entryChannel: EntryChannel.QR_CODE }),
      ).rejects.toThrow(BadRequestException)
    })

    it('throws NotFound when cancelling a ticket that does not exist', async () => {
      tx.ticket.findUnique.mockResolvedValue(null)

      await expect(service.cancel('ghost', 'motivo', manager)).rejects.toThrow(
        'Senha não encontrada',
      )
    })

    it('rejects cancelling a ticket that is no longer active', async () => {
      tx.ticket.findUnique.mockResolvedValue({ ...ticketBase, state: TicketState.FINISHED })

      await expect(service.cancel('ticket-1', 'motivo', manager)).rejects.toThrow(
        'A senha não pode ser cancelada no estado atual',
      )
    })

    it('maps a unique-constraint violation on restore to a conflict', async () => {
      prisma.ticket.findUnique.mockResolvedValue({ ...ticketBase, state: TicketState.NO_SHOW })
      tx.ticket.findFirst.mockResolvedValue(null)
      tx.queue.upsert.mockResolvedValue({ id: 'queue-1', nextSequence: 4 })
      const conflict = Object.assign(new Error('unique'), {
        code: 'P2002',
        clientVersion: '5',
        name: 'PrismaClientKnownRequestError',
      })
      Object.setPrototypeOf(conflict, Prisma.PrismaClientKnownRequestError.prototype)
      tx.ticket.updateMany.mockRejectedValue(conflict)

      await expect(service.restore('ticket-1', 'voltou', manager)).rejects.toThrow(
        ConflictException,
      )
    })

    it('rejects startService for a non-operator', async () => {
      await expect(service.startService('ticket-1', manager)).rejects.toThrow(ForbiddenException)
    })

    it('rejects startService when the ticket is no longer in CALLING', async () => {
      prisma.ticket.findUnique.mockResolvedValue({
        ...ticketBase,
        state: TicketState.CALLING,
        counterId: 'counter-1',
        operatorId: 'op-1',
      })
      tx.ticket.updateMany.mockResolvedValue({ count: 0 })

      await expect(service.startService('ticket-1', operator)).rejects.toThrow(BadRequestException)
    })

    it('rejects startService when the ticket belongs to another operator', async () => {
      prisma.ticket.findUnique.mockResolvedValue({
        ...ticketBase,
        state: TicketState.CALLING,
        counterId: 'counter-1',
        operatorId: 'op-other',
      })

      await expect(service.startService('ticket-1', operator)).rejects.toThrow(
        'A senha pertence a outra operadora',
      )
    })

    it('rejects finishService and noShow for a non-operator', async () => {
      await expect(service.finishService('ticket-1', manager)).rejects.toThrow(ForbiddenException)
      await expect(service.noShow('ticket-1', manager)).rejects.toThrow(ForbiddenException)
    })

    it('rejects correct for a non-manager', async () => {
      await expect(
        service.correct('ticket-1', { action: CorrectionAction.FINISH, reason: 'x' }, operator),
      ).rejects.toThrow(ForbiddenException)
    })

    it('rejects correct when the ticket is not in service', async () => {
      prisma.ticket.findUnique.mockResolvedValue({ ...ticketBase, state: TicketState.WAITING })

      await expect(
        service.correct('ticket-1', { action: CorrectionAction.FINISH, reason: 'x' }, manager),
      ).rejects.toThrow('Somente uma senha em atendimento pode ser corrigida')
    })

    it('lets an admin correct a ticket as a cancellation', async () => {
      prisma.ticket.findUnique.mockResolvedValue({
        ...ticketBase,
        state: TicketState.IN_SERVICE,
        counterId: 'counter-1',
        operatorId: 'op-1',
      })
      tx.ticket.updateMany.mockResolvedValue({ count: 1 })
      tx.counter.update.mockResolvedValue({})
      tx.ticket.findUniqueOrThrow.mockResolvedValue({ ...ticketBase, state: TicketState.CANCELLED })

      const result = await service.correct(
        'ticket-1',
        { action: CorrectionAction.CANCEL, reason: 'duplicada' },
        admin,
      )

      expect(result.state).toBe(TicketState.CANCELLED)
      expect(tx.auditEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ eventType: 'ticket_cancelled' }),
      })
      expect(panel.emitToER).toHaveBeenCalledWith(
        'er-1',
        'ticket.cancelled',
        expect.objectContaining({ ticketId: 'ticket-1' }),
      )
    })

    it('rejects correct when the ticket state changed mid-flight', async () => {
      prisma.ticket.findUnique.mockResolvedValue({
        ...ticketBase,
        state: TicketState.IN_SERVICE,
        counterId: 'counter-1',
      })
      tx.ticket.updateMany.mockResolvedValue({ count: 0 })

      await expect(
        service.correct('ticket-1', { action: CorrectionAction.FINISH, reason: 'x' }, manager),
      ).rejects.toThrow(ConflictException)
    })

    it('rejects create when the ER day is closed', async () => {
      tx.eR.findUnique.mockResolvedValue({ id: 'er-1', isDayOpen: false, dayOpenedAt: null })

      await expect(
        service.create(representative, { erId: 'er-1', entryChannel: EntryChannel.QR_CODE }),
      ).rejects.toThrow('A operação do ER está encerrada hoje')
    })

    it('rejects create from a role that cannot create tickets', async () => {
      await expect(
        service.create(operator, { erId: 'er-1', entryChannel: EntryChannel.QR_CODE }),
      ).rejects.toThrow('Este perfil não pode criar senhas')
      expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it('rejects an attendant creating a ticket in another ER', async () => {
      await expect(
        service.create(
          { ...attendant, erId: 'er-2' },
          { erId: 'er-1', entryChannel: EntryChannel.CHECKIN_ASSISTED, representativeId: 'rep-2' },
        ),
      ).rejects.toThrow('Não é possível criar uma senha em outro ER')
      expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it('maps a concurrent unique-constraint violation to a duplicate conflict', async () => {
      const conflict = Object.assign(new Error('unique'), {
        code: 'P2002',
        clientVersion: '5',
        name: 'PrismaClientKnownRequestError',
      })
      Object.setPrototypeOf(conflict, Prisma.PrismaClientKnownRequestError.prototype)
      tx.ticket.create.mockRejectedValue(conflict)
      // The recovery path uses the array form of $transaction; honor both shapes.
      prisma.$transaction.mockImplementation((arg: unknown) =>
        typeof arg === 'function'
          ? (arg as (client: typeof tx) => Promise<unknown>)(tx)
          : Promise.all(arg as Promise<unknown>[]),
      )

      await expect(
        service.create(representative, { erId: 'er-1', entryChannel: EntryChannel.QR_CODE }),
      ).rejects.toThrow('A representante já possui uma senha ativa neste ER')
    })

    it('rejects pause when a concurrent transition wins the CAS (count 0)', async () => {
      prisma.ticket.findUnique.mockResolvedValue(ticketBase)
      tx.ticket.updateMany.mockResolvedValue({ count: 0 })

      await expect(service.pauseTicket('ticket-1', 'rep-1')).rejects.toThrow(
        'Não foi possível pausar a senha',
      )
    })

    it('rejects resume when a concurrent transition wins the CAS (count 0)', async () => {
      prisma.ticket.findUnique.mockResolvedValue({ ...ticketBase, state: TicketState.PAUSED })
      tx.ticket.updateMany.mockResolvedValue({ count: 0 })

      await expect(service.resumeTicket('ticket-1', 'rep-1')).rejects.toThrow(
        'Não foi possível retomar a senha',
      )
    })

    it('rejects noShow when the ticket is no longer in CALLING (CAS count 0)', async () => {
      prisma.ticket.findUnique.mockResolvedValue({
        ...ticketBase,
        state: TicketState.IN_SERVICE,
        counterId: 'counter-1',
        operatorId: 'op-1',
      })
      tx.ticket.updateMany.mockResolvedValue({ count: 0 })

      await expect(service.noShow('ticket-1', operator)).rejects.toThrow(
        'A senha deve estar em chamada para registrar não comparecimento',
      )
    })

    it('rejects restore from a non-manager', async () => {
      await expect(service.restore('ticket-1', 'voltou', operator)).rejects.toThrow(
        'Somente gestoras podem restaurar senhas',
      )
      expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it('rejects restore when the ER day is closed', async () => {
      prisma.ticket.findUnique.mockResolvedValue({ ...ticketBase, state: TicketState.NO_SHOW })
      tx.eR.findUnique.mockResolvedValue({ id: 'er-1', isDayOpen: false })

      await expect(service.restore('ticket-1', 'voltou', manager)).rejects.toThrow(
        'A operação do ER está encerrada hoje',
      )
    })
  })

  describe('getMyActiveTicket', () => {
    it('requires an erId so the ER filter is never silently dropped', async () => {
      await expect(service.getMyActiveTicket('rep-1', '')).rejects.toThrow(BadRequestException)
      expect(prisma.ticket.findFirst).not.toHaveBeenCalled()
    })

    it('returns the active waiting ticket with position and pause timeout', async () => {
      prisma.ticket.findFirst.mockResolvedValue({
        ...ticketBase,
        representative: { fullName: 'Maria Teste' },
        er: { pauseTimeoutSeconds: 300, callTimeoutSeconds: 600 },
      })
      prisma.ticket.count.mockResolvedValue(2)

      const result = await service.getMyActiveTicket('rep-1', 'er-1')

      expect(result.currentPosition).toBe(2)
      expect(result.pauseTimeoutSeconds).toBe(300)
      expect((result as { er?: unknown }).er).toBeUndefined()
    })

    it('reports position 0 for a paused (non-waiting) ticket', async () => {
      prisma.ticket.findFirst.mockResolvedValue({
        ...ticketBase,
        state: TicketState.PAUSED,
        pausedAt: new Date(),
        representative: { fullName: 'Maria Teste' },
        er: { pauseTimeoutSeconds: 300, callTimeoutSeconds: 600 },
      })

      const result = await service.getMyActiveTicket('rep-1', 'er-1')

      expect(result.currentPosition).toBe(0)
      expect(prisma.ticket.count).not.toHaveBeenCalled()
    })

    it('throws NotFound when there is no active ticket', async () => {
      prisma.ticket.findFirst.mockResolvedValue(null)

      await expect(service.getMyActiveTicket('rep-1', 'er-1')).rejects.toThrow(
        'Nenhuma senha ativa encontrada para este ER',
      )
    })

    it('resumes a stale paused ticket on read and returns it as waiting (no longer cancels)', async () => {
      prisma.ticket.findFirst.mockResolvedValue({
        ...ticketBase,
        state: TicketState.PAUSED,
        pausedAt: new Date(Date.now() - 10 * 60 * 1000),
        representative: { fullName: 'Maria Teste' },
        er: { pauseTimeoutSeconds: 300, callTimeoutSeconds: 600 },
      })
      tx.queue.upsert.mockResolvedValue({ id: 'queue-1', nextSequence: 5 })
      tx.ticket.updateMany.mockResolvedValue({ count: 1 })
      tx.ticket.findUniqueOrThrow.mockResolvedValue({
        ...ticketBase,
        state: TicketState.WAITING,
        code: 'A005',
        queuePosition: 5,
        representative: { fullName: 'Maria Teste' },
      })
      // Re-busca em getMyActiveTicket após a retomada.
      prisma.ticket.findUniqueOrThrow.mockResolvedValue({
        ...ticketBase,
        state: TicketState.WAITING,
        code: 'A005',
        queuePosition: 5,
        representative: { fullName: 'Maria Teste' },
        er: { pauseTimeoutSeconds: 300, callTimeoutSeconds: 600 },
      })
      prisma.ticket.count.mockResolvedValue(5)

      const result = await service.getMyActiveTicket('rep-1', 'er-1')

      expect(tx.ticket.updateMany).toHaveBeenCalledWith({
        where: { id: 'ticket-1', state: TicketState.PAUSED },
        data: expect.objectContaining({ state: TicketState.WAITING, pausedAt: null }),
      })
      expect(tx.auditEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ eventType: 'ticket_pause_expired' }),
      })
      expect(panel.emitToER).toHaveBeenCalledWith(
        'er-1',
        'ticket.created',
        expect.objectContaining({ ticketId: 'ticket-1' }),
      )
      expect(result.state).toBe(TicketState.WAITING)
    })

    it('reports no active ticket if the paused ticket left PAUSED before the resume (race)', async () => {
      prisma.ticket.findFirst.mockResolvedValue({
        ...ticketBase,
        state: TicketState.PAUSED,
        pausedAt: new Date(Date.now() - 10 * 60 * 1000),
        representative: { fullName: 'Maria Teste' },
        er: { pauseTimeoutSeconds: 300, callTimeoutSeconds: 600 },
      })
      tx.queue.upsert.mockResolvedValue({ id: 'queue-1', nextSequence: 5 })
      // Corrida: a retomada não encontra mais a senha em PAUSED (count 0).
      tx.ticket.updateMany.mockResolvedValue({ count: 0 })
      prisma.ticket.findUniqueOrThrow.mockResolvedValue({
        ...ticketBase,
        state: TicketState.CANCELLED,
        representative: { fullName: 'Maria Teste' },
        er: { pauseTimeoutSeconds: 300, callTimeoutSeconds: 600 },
      })

      await expect(service.getMyActiveTicket('rep-1', 'er-1')).rejects.toThrow(
        'Nenhuma senha ativa encontrada para este ER',
      )
    })

    it('expires a stale called ticket on read and then reports no active ticket', async () => {
      prisma.ticket.findFirst.mockResolvedValue({
        ...ticketBase,
        state: TicketState.CALLING,
        calledAt: new Date(Date.now() - 20 * 60 * 1000),
        counterId: 'counter-1',
        representative: { fullName: 'Maria Teste' },
        er: { pauseTimeoutSeconds: 300, callTimeoutSeconds: 600 },
      })
      tx.ticket.updateMany.mockResolvedValue({ count: 1 })

      await expect(service.getMyActiveTicket('rep-1', 'er-1')).rejects.toThrow(
        'Nenhuma senha ativa encontrada para este ER',
      )

      expect(tx.ticket.updateMany).toHaveBeenCalledWith({
        where: { id: 'ticket-1', state: TicketState.CALLING },
        data: expect.objectContaining({ state: TicketState.NO_SHOW }),
      })
      expect(panel.emitToER).toHaveBeenCalledWith(
        'er-1',
        'ticket.no_show',
        expect.objectContaining({ ticketId: 'ticket-1' }),
      )
    })
  })

  describe('getMyTicketStatus', () => {
    it('requires an erId so the ER filter is never silently dropped', async () => {
      await expect(service.getMyTicketStatus('rep-1', '')).rejects.toThrow(BadRequestException)
      expect(prisma.ticket.findFirst).not.toHaveBeenCalled()
    })

    it('returns a NO_SHOW ticket instead of throwing (so the RE sees the real state)', async () => {
      prisma.ticket.findFirst.mockResolvedValue({
        ...ticketBase,
        state: TicketState.NO_SHOW,
        representative: { fullName: 'Maria Teste' },
        er: { pauseTimeoutSeconds: 300, callTimeoutSeconds: 600 },
      })

      const result = await service.getMyTicketStatus('rep-1', 'er-1')

      expect(result.state).toBe(TicketState.NO_SHOW)
      expect(result.currentPosition).toBe(0)
      expect(prisma.ticket.count).not.toHaveBeenCalled()
      expect((result as { er?: unknown }).er).toBeUndefined()
    })

    it('returns the restored WAITING ticket with its position', async () => {
      prisma.ticket.findFirst.mockResolvedValue({
        ...ticketBase,
        state: TicketState.WAITING,
        representative: { fullName: 'Maria Teste' },
        er: { pauseTimeoutSeconds: 300, callTimeoutSeconds: 600 },
      })
      prisma.ticket.count.mockResolvedValue(4)

      const result = await service.getMyTicketStatus('rep-1', 'er-1')

      expect(result.state).toBe(TicketState.WAITING)
      expect(result.currentPosition).toBe(4)
    })

    it('throws NotFound when the RE has no ticket for the ER', async () => {
      prisma.ticket.findFirst.mockResolvedValue(null)

      await expect(service.getMyTicketStatus('rep-1', 'er-1')).rejects.toThrow(
        'Nenhuma senha encontrada para este ER',
      )
    })

    it('resumes a stale paused ticket on read and returns it as WAITING (no longer cancels)', async () => {
      prisma.ticket.findFirst.mockResolvedValue({
        ...ticketBase,
        state: TicketState.PAUSED,
        pausedAt: new Date(Date.now() - 10 * 60 * 1000),
        representative: { fullName: 'Maria Teste' },
        er: { pauseTimeoutSeconds: 300, callTimeoutSeconds: 600 },
      })
      tx.queue.upsert.mockResolvedValue({ id: 'queue-1', nextSequence: 5 })
      tx.ticket.updateMany.mockResolvedValue({ count: 1 })
      tx.ticket.findUniqueOrThrow.mockResolvedValue({
        ...ticketBase,
        state: TicketState.WAITING,
        code: 'A005',
        queuePosition: 5,
        representative: { fullName: 'Maria Teste' },
      })
      prisma.ticket.findUniqueOrThrow.mockResolvedValue({
        ...ticketBase,
        state: TicketState.WAITING,
        code: 'A005',
        queuePosition: 5,
        representative: { fullName: 'Maria Teste' },
        er: { pauseTimeoutSeconds: 300, callTimeoutSeconds: 600 },
      })
      prisma.ticket.count.mockResolvedValue(5)

      const result = await service.getMyTicketStatus('rep-1', 'er-1')

      expect(result.state).toBe(TicketState.WAITING)
      expect(panel.emitToER).toHaveBeenCalledWith(
        'er-1',
        'ticket.created',
        expect.objectContaining({ ticketId: 'ticket-1' }),
      )
    })

    it('expires a stale called ticket on read and returns it as NO_SHOW', async () => {
      prisma.ticket.findFirst.mockResolvedValue({
        ...ticketBase,
        state: TicketState.CALLING,
        calledAt: new Date(Date.now() - 20 * 60 * 1000),
        counterId: 'counter-1',
        representative: { fullName: 'Maria Teste' },
        er: { pauseTimeoutSeconds: 300, callTimeoutSeconds: 600 },
      })
      tx.ticket.updateMany.mockResolvedValue({ count: 1 })
      prisma.ticket.findUniqueOrThrow.mockResolvedValue({
        ...ticketBase,
        state: TicketState.NO_SHOW,
        representative: { fullName: 'Maria Teste' },
        er: { pauseTimeoutSeconds: 300, callTimeoutSeconds: 600 },
      })

      const result = await service.getMyTicketStatus('rep-1', 'er-1')

      expect(result.state).toBe(TicketState.NO_SHOW)
      expect(tx.counter.updateMany).toHaveBeenCalledWith({
        where: { id: 'counter-1', state: CounterState.CALLING },
        data: { state: CounterState.ACTIVE },
      })
      expect(panel.emitToER).toHaveBeenCalledWith(
        'er-1',
        'ticket.no_show',
        expect.objectContaining({ ticketId: 'ticket-1' }),
      )
    })
  })

  describe('expireStalePauses', () => {
    const stale = {
      id: 'ticket-1',
      code: 'A001',
      erId: 'er-1',
      queueId: 'queue-1',
      queuePosition: 1,
      pausedAt: new Date(Date.now() - 10 * 60 * 1000),
      representativeId: 'rep-1',
      er: { pauseTimeoutSeconds: 300, callTimeoutSeconds: 600 },
    }

    it('resumes paused tickets that exceeded the pause timeout (no longer cancels)', async () => {
      prisma.ticket.findMany.mockResolvedValue([stale])
      tx.queue.upsert.mockResolvedValue({ id: 'queue-1', nextSequence: 9 })
      tx.ticket.updateMany.mockResolvedValue({ count: 1 })
      tx.ticket.findUniqueOrThrow.mockResolvedValue({
        ...ticketBase,
        state: TicketState.WAITING,
        code: 'A009',
        queuePosition: 9,
        representative: { fullName: 'Maria Teste' },
      })
      prisma.ticket.count.mockResolvedValue(9)

      await service.expireStalePauses()

      // Volta para a fila (WAITING), não cancela.
      expect(tx.ticket.updateMany).toHaveBeenCalledWith({
        where: { id: 'ticket-1', state: TicketState.PAUSED },
        data: expect.objectContaining({ state: TicketState.WAITING, pausedAt: null }),
      })
      // Penalidade da expiração: NOVO slot ao FIM da fila (nextSequence) e NOVO
      // código — ao contrário da retomada manual, que preserva queuePosition/code.
      const expiredData = tx.ticket.updateMany.mock.calls[0][0].data
      expect(expiredData.queuePosition).toBe(9)
      expect(expiredData.code).toBe('A009')
      expect(tx.auditEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ eventType: 'ticket_pause_expired' }),
      })
      expect(panel.emitToER).toHaveBeenCalledWith(
        'er-1',
        'ticket.created',
        expect.objectContaining({ ticketId: 'ticket-1' }),
      )
      expect(panel.emitToER).not.toHaveBeenCalledWith('er-1', 'ticket.cancelled', expect.anything())
    })

    it('leaves paused tickets still within the tolerance untouched', async () => {
      prisma.ticket.findMany.mockResolvedValue([{ ...stale, pausedAt: new Date() }])

      await service.expireStalePauses()

      expect(tx.ticket.updateMany).not.toHaveBeenCalled()
      expect(panel.emitToER).not.toHaveBeenCalled()
    })

    it('does not emit when the resume update touched no row (already resolved)', async () => {
      prisma.ticket.findMany.mockResolvedValue([stale])
      tx.queue.upsert.mockResolvedValue({ id: 'queue-1', nextSequence: 9 })
      tx.ticket.updateMany.mockResolvedValue({ count: 0 })

      await service.expireStalePauses()

      expect(tx.ticket.updateMany).toHaveBeenCalledTimes(1)
      expect(panel.emitToER).not.toHaveBeenCalled()
    })

    it('only scans PAUSED tickets of ERs whose pause timeout is enabled', async () => {
      prisma.ticket.findMany.mockResolvedValue([])

      await service.expireStalePauses()

      // O filtro `pauseTimeoutSeconds > 0` é o que desliga a expiração num ER com
      // timeout 0: essas senhas nem entram na varredura.
      expect(prisma.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            state: TicketState.PAUSED,
            pausedAt: { not: null },
            er: { pauseTimeoutSeconds: { gt: 0 } },
          },
        }),
      )
    })

    it('expires exactly at the timeout boundary but not one second before', async () => {
      jest.useFakeTimers()
      jest.setSystemTime(new Date('2026-06-23T15:00:00Z'))
      try {
        tx.queue.upsert.mockResolvedValue({ id: 'queue-1', nextSequence: 9 })
        tx.ticket.updateMany.mockResolvedValue({ count: 1 })
        tx.ticket.findUniqueOrThrow.mockResolvedValue({
          ...ticketBase,
          state: TicketState.WAITING,
          code: 'A009',
          queuePosition: 9,
          representative: { fullName: 'Maria Teste' },
        })
        prisma.ticket.count.mockResolvedValue(9)

        // 1s antes do limite (timeout 300s) → NÃO expira.
        prisma.ticket.findMany.mockResolvedValue([
          { ...stale, pausedAt: new Date(Date.now() - 299_000) },
        ])
        await service.expireStalePauses()
        expect(tx.ticket.updateMany).not.toHaveBeenCalled()

        // Exatamente no limite (300s; comparação `>=`) → expira.
        prisma.ticket.findMany.mockResolvedValue([
          { ...stale, pausedAt: new Date(Date.now() - 300_000) },
        ])
        await service.expireStalePauses()
        expect(tx.ticket.updateMany).toHaveBeenCalled()
      } finally {
        jest.useRealTimers()
      }
    })
  })
})
