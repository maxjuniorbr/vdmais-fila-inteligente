import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import { AuthenticatedUser } from '../../common/authenticated-user'
import { CounterState, Prisma, Role } from '@prisma/client'
import { PanelGateway } from '../../panel/panel.gateway'
import { PrismaService } from '../../prisma/prisma.service'
import { CounterService } from '../counter.service'

const operator: { userId: string; role: Role; erId: string } = {
  userId: 'op-1',
  role: Role.OPERATOR,
  erId: 'er-1',
}
const manager = { userId: 'mgr-1', role: Role.MANAGER, erId: 'er-1' }

const counterBase = {
  id: 'counter-1',
  number: 1,
  erId: 'er-1',
  operatorId: null,
  state: CounterState.UNAVAILABLE,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const prisma = {
  counter: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  eR: { findUnique: jest.fn() },
  auditEvent: { create: jest.fn() },
  ticket: { findFirst: jest.fn() },
  $transaction: jest.fn((cb: (tx: unknown) => Promise<unknown>) => cb(tx)),
}

const tx = {
  counter: {
    update: jest.fn(),
    updateMany: jest.fn(),
    findUniqueOrThrow: jest.fn(),
  },
  auditEvent: { create: jest.fn() },
  ticket: { findFirst: jest.fn(), update: jest.fn() },
}

const panel = { emitToER: jest.fn() }

describe('CounterService', () => {
  let service: CounterService

  beforeEach(() => {
    jest.resetAllMocks()
    prisma.$transaction.mockImplementation((cb: (tx: unknown) => Promise<unknown>) => cb(tx))
    service = new CounterService(
      prisma as unknown as PrismaService,
      panel as unknown as PanelGateway,
    )
    prisma.counter.findUnique.mockResolvedValue({ ...counterBase })
    prisma.counter.findFirst.mockResolvedValue(null)
    prisma.eR.findUnique.mockResolvedValue({ isDayOpen: true })
    tx.counter.updateMany.mockResolvedValue({ count: 1 })
    tx.counter.findUniqueOrThrow.mockResolvedValue({
      ...counterBase,
      state: CounterState.ACTIVE,
      operatorId: 'op-1',
    })
    tx.auditEvent.create.mockResolvedValue({})
    tx.ticket.findFirst.mockResolvedValue(null)
  })

  it('lists the counters of the operator ER', async () => {
    prisma.counter.findMany.mockResolvedValue([{ ...counterBase }])

    const result = await service.listForER(operator)

    expect(prisma.counter.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { erId: 'er-1' } }),
    )
    expect(result).toHaveLength(1)
  })

  it('rejects listForER when the user is not bound to an ER', async () => {
    const unboundUser: AuthenticatedUser = { userId: 'op-1', role: Role.OPERATOR }
    expect(() => service.listForER(unboundUser)).toThrow(ForbiddenException)
    expect(prisma.counter.findMany).not.toHaveBeenCalled()
  })

  it('rejects operating a counter that does not exist', async () => {
    prisma.counter.findUnique.mockResolvedValue(null)

    await expect(service.openCounter('counter-1', operator)).rejects.toThrow(NotFoundException)
  })

  it('rejects operating a counter from another ER', async () => {
    prisma.counter.findUnique.mockResolvedValue({ ...counterBase, erId: 'er-2' })

    await expect(service.openCounter('counter-1', operator)).rejects.toThrow(ForbiddenException)
  })

  it('opens an UNAVAILABLE counter and assigns the operator', async () => {
    const result = await service.openCounter('counter-1', operator)

    expect(tx.counter.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'counter-1',
        state: CounterState.UNAVAILABLE,
        operatorId: null,
      },
      data: { state: CounterState.ACTIVE, operatorId: 'op-1' },
    })
    expect(panel.emitToER).toHaveBeenCalledWith('er-1', 'counter.opened', expect.any(Object))
    expect(result.state).toBe(CounterState.ACTIVE)
  })

  it('rejects openCounter if counter belongs to another operator', async () => {
    prisma.counter.findUnique.mockResolvedValue({ ...counterBase, operatorId: 'other-op' })

    await expect(service.openCounter('counter-1', operator)).rejects.toThrow(ConflictException)
  })

  it('rejects openCounter if counter is already open', async () => {
    prisma.counter.findUnique.mockResolvedValue({ ...counterBase, state: CounterState.ACTIVE })

    await expect(service.openCounter('counter-1', operator)).rejects.toThrow(ConflictException)
  })

  it('rejects openCounter if operator already has another open counter', async () => {
    prisma.counter.findFirst.mockResolvedValue({ id: 'other-counter' })

    await expect(service.openCounter('counter-1', operator)).rejects.toThrow(ConflictException)
  })

  it('rejects openCounter when the operation of the day is not open', async () => {
    prisma.eR.findUnique.mockResolvedValue({ isDayOpen: false })

    await expect(service.openCounter('counter-1', operator)).rejects.toThrow(BadRequestException)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('rejects openCounter if another request acquired the counter first', async () => {
    tx.counter.updateMany.mockResolvedValue({ count: 0 })

    await expect(service.openCounter('counter-1', operator)).rejects.toThrow(
      'O caixa já está aberto',
    )
    expect(tx.auditEvent.create).not.toHaveBeenCalled()
  })

  it('converts the database uniqueness violation into an operator conflict', async () => {
    tx.counter.updateMany.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.19.3',
        meta: { target: ['operatorId'] },
      }),
    )

    await expect(service.openCounter('counter-1', operator)).rejects.toThrow(
      'O(a) operador(a) já possui outro caixa aberto',
    )
  })

  it('does not let a manager open a counter', async () => {
    await expect(service.openCounter('counter-1', manager)).rejects.toThrow(ForbiddenException)
  })

  it('pauses an ACTIVE counter owned by the operator', async () => {
    prisma.counter.findUnique.mockResolvedValue({
      ...counterBase,
      state: CounterState.ACTIVE,
      operatorId: 'op-1',
    })
    tx.counter.updateMany.mockResolvedValue({ count: 1 })
    tx.counter.findUniqueOrThrow.mockResolvedValue({ ...counterBase, state: CounterState.PAUSED })

    const result = await service.pauseCounter('counter-1', operator, 'intervalo')

    expect(tx.counter.updateMany).toHaveBeenCalledWith({
      where: { id: 'counter-1', operatorId: 'op-1', state: CounterState.ACTIVE },
      data: { state: CounterState.PAUSED },
    })
    expect(tx.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: 'counter_paused',
        metadata: expect.objectContaining({ reason: 'intervalo' }),
      }),
    })
    expect(panel.emitToER).toHaveBeenCalledWith('er-1', 'counter.paused', expect.any(Object))
    expect(result.state).toBe(CounterState.PAUSED)
  })

  it('rejects pauseCounter if counter belongs to another operator', async () => {
    prisma.counter.findUnique.mockResolvedValue({
      ...counterBase,
      state: CounterState.ACTIVE,
      operatorId: 'other-op',
    })

    await expect(service.pauseCounter('counter-1', operator, 'intervalo')).rejects.toThrow(BadRequestException)
  })

  it('rejects pauseCounter if counter is not ACTIVE', async () => {
    prisma.counter.findUnique.mockResolvedValue({
      ...counterBase,
      state: CounterState.PAUSED,
      operatorId: 'op-1',
    })

    await expect(service.pauseCounter('counter-1', operator, 'intervalo')).rejects.toThrow(BadRequestException)
  })

  it('rejects pauseCounter if a concurrent transition changed the counter (CAS lost)', async () => {
    prisma.counter.findUnique.mockResolvedValue({
      ...counterBase,
      state: CounterState.ACTIVE,
      operatorId: 'op-1',
    })
    tx.counter.updateMany.mockResolvedValue({ count: 0 })

    await expect(service.pauseCounter('counter-1', operator, 'intervalo')).rejects.toThrow(BadRequestException)
    expect(tx.auditEvent.create).not.toHaveBeenCalled()
    expect(panel.emitToER).not.toHaveBeenCalled()
  })

  it('rejects pausing with "outro" and no detail', async () => {
    await expect(service.pauseCounter('counter-1', operator, 'outro')).rejects.toThrow(
      BadRequestException,
    )
  })

  it('stores the trimmed detail when pausing with "outro"', async () => {
    prisma.counter.findUnique.mockResolvedValue({
      ...counterBase,
      state: CounterState.ACTIVE,
      operatorId: 'op-1',
    })
    tx.counter.updateMany.mockResolvedValue({ count: 1 })
    tx.counter.findUniqueOrThrow.mockResolvedValue({ ...counterBase, state: CounterState.PAUSED })

    await service.pauseCounter('counter-1', operator, 'outro', '  reforma elétrica  ')

    expect(tx.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: expect.objectContaining({ reason: 'outro', detail: 'reforma elétrica' }),
      }),
    })
    expect(panel.emitToER).toHaveBeenCalledWith(
      'er-1',
      'counter.paused',
      expect.objectContaining({ detail: 'reforma elétrica' }),
    )
  })

  it('resumes a PAUSED counter owned by the operator', async () => {
    prisma.counter.findUnique.mockResolvedValue({
      ...counterBase,
      state: CounterState.PAUSED,
      operatorId: 'op-1',
    })
    tx.counter.updateMany.mockResolvedValue({ count: 1 })
    tx.counter.findUniqueOrThrow.mockResolvedValue({ ...counterBase, state: CounterState.ACTIVE })

    const result = await service.resumeCounter('counter-1', operator)

    expect(tx.counter.updateMany).toHaveBeenCalledWith({
      where: { id: 'counter-1', operatorId: 'op-1', state: CounterState.PAUSED },
      data: { state: CounterState.ACTIVE },
    })
    expect(panel.emitToER).toHaveBeenCalledWith('er-1', 'counter.resumed', expect.any(Object))
    expect(result.state).toBe(CounterState.ACTIVE)
  })

  it('rejects resumeCounter if counter belongs to another operator', async () => {
    prisma.counter.findUnique.mockResolvedValue({
      ...counterBase,
      state: CounterState.PAUSED,
      operatorId: 'other-op',
    })

    await expect(service.resumeCounter('counter-1', operator)).rejects.toThrow(BadRequestException)
  })

  it('rejects resumeCounter if counter is not PAUSED', async () => {
    prisma.counter.findUnique.mockResolvedValue({
      ...counterBase,
      state: CounterState.ACTIVE,
      operatorId: 'op-1',
    })

    await expect(service.resumeCounter('counter-1', operator)).rejects.toThrow(BadRequestException)
  })

  it('rejects resumeCounter if a concurrent transition changed the counter (CAS lost)', async () => {
    prisma.counter.findUnique.mockResolvedValue({
      ...counterBase,
      state: CounterState.PAUSED,
      operatorId: 'op-1',
    })
    tx.counter.updateMany.mockResolvedValue({ count: 0 })

    await expect(service.resumeCounter('counter-1', operator)).rejects.toThrow(BadRequestException)
    expect(tx.auditEvent.create).not.toHaveBeenCalled()
    expect(panel.emitToER).not.toHaveBeenCalled()
  })

  it('closes an ACTIVE counter with no open tickets', async () => {
    prisma.counter.findUnique.mockResolvedValue({
      ...counterBase,
      state: CounterState.ACTIVE,
      operatorId: 'op-1',
    })
    tx.ticket.findFirst.mockResolvedValue(null)
    tx.counter.updateMany.mockResolvedValue({ count: 1 })
    tx.counter.findUniqueOrThrow.mockResolvedValue({
      ...counterBase,
      state: CounterState.UNAVAILABLE,
      operatorId: null,
    })

    const result = await service.closeCounter('counter-1', operator)

    expect(tx.counter.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'counter-1',
        operatorId: 'op-1',
        state: { in: [CounterState.ACTIVE, CounterState.PAUSED] },
      },
      data: { state: CounterState.UNAVAILABLE, operatorId: null },
    })
    expect(panel.emitToER).toHaveBeenCalledWith('er-1', 'counter.closed', expect.any(Object))
    expect(result.state).toBe(CounterState.UNAVAILABLE)
  })

  it('rejects closeCounter if counter belongs to another operator', async () => {
    prisma.counter.findUnique.mockResolvedValue({
      ...counterBase,
      state: CounterState.ACTIVE,
      operatorId: 'other-op',
    })

    await expect(service.closeCounter('counter-1', operator)).rejects.toThrow(BadRequestException)
  })

  it('rejects closeCounter when there is an open ticket on the counter', async () => {
    prisma.counter.findUnique.mockResolvedValue({
      ...counterBase,
      state: CounterState.ACTIVE,
      operatorId: 'op-1',
    })
    tx.ticket.findFirst.mockResolvedValue({ id: 'ticket-1' })

    await expect(service.closeCounter('counter-1', operator)).rejects.toThrow(BadRequestException)
  })

  it('rejects closeCounter if counter is in CALLING or IN_SERVICE state', async () => {
    prisma.counter.findUnique.mockResolvedValue({
      ...counterBase,
      state: CounterState.CALLING,
      operatorId: 'op-1',
    })

    await expect(service.closeCounter('counter-1', operator)).rejects.toThrow(BadRequestException)
  })

  it('rejects closeCounter if counter is in IN_SERVICE state', async () => {
    prisma.counter.findUnique.mockResolvedValue({
      ...counterBase,
      state: CounterState.IN_SERVICE,
      operatorId: 'op-1',
    })

    await expect(service.closeCounter('counter-1', operator)).rejects.toThrow(BadRequestException)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('rejects closeCounter if counter is already UNAVAILABLE', async () => {
    prisma.counter.findUnique.mockResolvedValue({
      ...counterBase,
      state: CounterState.UNAVAILABLE,
      operatorId: 'op-1',
    })

    await expect(service.closeCounter('counter-1', operator)).rejects.toThrow(BadRequestException)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('rejects closeCounter if a concurrent transition changed the counter (CAS lost)', async () => {
    prisma.counter.findUnique.mockResolvedValue({
      ...counterBase,
      state: CounterState.ACTIVE,
      operatorId: 'op-1',
    })
    tx.ticket.findFirst.mockResolvedValue(null)
    tx.counter.updateMany.mockResolvedValue({ count: 0 })

    await expect(service.closeCounter('counter-1', operator)).rejects.toThrow(BadRequestException)
    expect(tx.auditEvent.create).not.toHaveBeenCalled()
    expect(panel.emitToER).not.toHaveBeenCalled()
  })

  it('force-releases a counter and marks a CALLING ticket as no-show', async () => {
    prisma.counter.findUnique.mockResolvedValue({
      ...counterBase,
      state: CounterState.CALLING,
      operatorId: 'op-1',
    })
    tx.ticket.findFirst.mockResolvedValue({
      id: 'ticket-1',
      state: 'CALLING',
      code: 'A001',
    })
    tx.counter.update.mockResolvedValue({
      ...counterBase,
      state: CounterState.UNAVAILABLE,
      operatorId: null,
    })

    const result = await service.forceReleaseCounter('counter-1', manager)

    expect(tx.ticket.update).toHaveBeenCalledWith({
      where: { id: 'ticket-1' },
      data: expect.objectContaining({ state: 'NO_SHOW' }),
    })
    expect(tx.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ eventType: 'ticket_marked_no_show' }),
    })
    expect(tx.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ eventType: 'counter_force_released' }),
    })
    expect(tx.counter.update).toHaveBeenCalledWith({
      where: { id: 'counter-1' },
      data: { state: CounterState.UNAVAILABLE, operatorId: null },
    })
    expect(panel.emitToER).toHaveBeenCalledWith('er-1', 'ticket.no_show', expect.any(Object))
    expect(panel.emitToER).toHaveBeenCalledWith('er-1', 'counter.closed', expect.any(Object))
    expect(result.state).toBe(CounterState.UNAVAILABLE)
  })

  it('force-releases a counter and finishes an IN_SERVICE ticket', async () => {
    prisma.counter.findUnique.mockResolvedValue({
      ...counterBase,
      state: CounterState.IN_SERVICE,
      operatorId: 'op-1',
    })
    tx.ticket.findFirst.mockResolvedValue({ id: 'ticket-1', state: 'IN_SERVICE', code: 'A001' })
    tx.counter.update.mockResolvedValue({
      ...counterBase,
      state: CounterState.UNAVAILABLE,
      operatorId: null,
    })

    await service.forceReleaseCounter('counter-1', manager)

    expect(tx.ticket.update).toHaveBeenCalledWith({
      where: { id: 'ticket-1' },
      data: expect.objectContaining({ state: 'FINISHED' }),
    })
    expect(tx.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ eventType: 'service_force_finished' }),
    })
    expect(panel.emitToER).toHaveBeenCalledWith(
      'er-1',
      'ticket.service_finished',
      expect.any(Object),
    )
  })

  it('force-releases an idle counter without an open ticket', async () => {
    prisma.counter.findUnique.mockResolvedValue({
      ...counterBase,
      state: CounterState.ACTIVE,
      operatorId: 'op-1',
    })
    tx.ticket.findFirst.mockResolvedValue(null)
    tx.counter.update.mockResolvedValue({
      ...counterBase,
      state: CounterState.UNAVAILABLE,
      operatorId: null,
    })

    await service.forceReleaseCounter('counter-1', manager)

    expect(tx.ticket.update).not.toHaveBeenCalled()
    expect(tx.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: 'counter_force_released',
        metadata: expect.objectContaining({ hadOpenTicket: false }),
      }),
    })
  })

  it('lets an admin force-release a counter from any ER', async () => {
    const admin = { userId: 'adm-1', role: Role.ADMIN, erId: 'er-9' }
    prisma.counter.findUnique.mockResolvedValue({ ...counterBase, erId: 'er-2' })
    tx.ticket.findFirst.mockResolvedValue(null)
    tx.counter.update.mockResolvedValue({
      ...counterBase,
      erId: 'er-2',
      state: CounterState.UNAVAILABLE,
      operatorId: null,
    })

    const result = await service.forceReleaseCounter('counter-1', admin)

    expect(panel.emitToER).toHaveBeenCalledWith('er-2', 'counter.closed', expect.any(Object))
    expect(result.state).toBe(CounterState.UNAVAILABLE)
  })

  it('does not let an operator force-release a counter', async () => {
    await expect(service.forceReleaseCounter('counter-1', operator)).rejects.toThrow(
      ForbiddenException,
    )
  })

  it('blocks force-release of a counter from another ER', async () => {
    prisma.counter.findUnique.mockResolvedValue({ ...counterBase, erId: 'er-2' })

    await expect(service.forceReleaseCounter('counter-1', manager)).rejects.toThrow(
      ForbiddenException,
    )
  })
})
