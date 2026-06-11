import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common'
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
  ticket: { findFirst: jest.fn() },
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
    tx.counter.updateMany.mockResolvedValue({ count: 1 })
    tx.counter.findUniqueOrThrow.mockResolvedValue({
      ...counterBase,
      state: CounterState.ACTIVE,
      operatorId: 'op-1',
    })
    tx.auditEvent.create.mockResolvedValue({})
    tx.ticket.findFirst.mockResolvedValue(null)
  })

  // ── openCounter ─────────────────────────────────────────────

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
      'A operadora já possui outro caixa aberto',
    )
  })

  it('does not let a manager open a counter', async () => {
    await expect(service.openCounter('counter-1', manager)).rejects.toThrow(ForbiddenException)
  })

  // ── pauseCounter ─────────────────────────────────────────────

  it('pauses an ACTIVE counter owned by the operator', async () => {
    prisma.counter.findUnique.mockResolvedValue({
      ...counterBase,
      state: CounterState.ACTIVE,
      operatorId: 'op-1',
    })
    tx.counter.update.mockResolvedValue({ ...counterBase, state: CounterState.PAUSED })

    const result = await service.pauseCounter('counter-1', operator, 'Intervalo')

    expect(tx.counter.update).toHaveBeenCalledWith({
      where: { id: 'counter-1' },
      data: { state: CounterState.PAUSED },
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

    await expect(service.pauseCounter('counter-1', operator, 'x')).rejects.toThrow(BadRequestException)
  })

  it('rejects pauseCounter if counter is not ACTIVE', async () => {
    prisma.counter.findUnique.mockResolvedValue({
      ...counterBase,
      state: CounterState.PAUSED,
      operatorId: 'op-1',
    })

    await expect(service.pauseCounter('counter-1', operator, 'x')).rejects.toThrow(BadRequestException)
  })

  // ── resumeCounter ─────────────────────────────────────────────

  it('resumes a PAUSED counter owned by the operator', async () => {
    prisma.counter.findUnique.mockResolvedValue({
      ...counterBase,
      state: CounterState.PAUSED,
      operatorId: 'op-1',
    })
    tx.counter.update.mockResolvedValue({ ...counterBase, state: CounterState.ACTIVE })

    const result = await service.resumeCounter('counter-1', operator)

    expect(tx.counter.update).toHaveBeenCalledWith({
      where: { id: 'counter-1' },
      data: { state: CounterState.ACTIVE },
    })
    expect(panel.emitToER).toHaveBeenCalledWith('er-1', 'counter.resumed', expect.any(Object))
    expect(result.state).toBe(CounterState.ACTIVE)
  })

  it('rejects resumeCounter if counter is not PAUSED', async () => {
    prisma.counter.findUnique.mockResolvedValue({
      ...counterBase,
      state: CounterState.ACTIVE,
      operatorId: 'op-1',
    })

    await expect(service.resumeCounter('counter-1', operator)).rejects.toThrow(BadRequestException)
  })

  // ── closeCounter ─────────────────────────────────────────────

  it('closes an ACTIVE counter with no open tickets', async () => {
    prisma.counter.findUnique.mockResolvedValue({
      ...counterBase,
      state: CounterState.ACTIVE,
      operatorId: 'op-1',
    })
    tx.ticket.findFirst.mockResolvedValue(null)
    tx.counter.update.mockResolvedValue({ ...counterBase, state: CounterState.UNAVAILABLE, operatorId: null })

    const result = await service.closeCounter('counter-1', operator)

    expect(tx.counter.update).toHaveBeenCalledWith({
      where: { id: 'counter-1' },
      data: { state: CounterState.UNAVAILABLE, operatorId: null },
    })
    expect(panel.emitToER).toHaveBeenCalledWith('er-1', 'counter.closed', expect.any(Object))
    expect(result.state).toBe(CounterState.UNAVAILABLE)
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
})
