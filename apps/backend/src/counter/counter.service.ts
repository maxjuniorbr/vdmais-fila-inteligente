import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CounterState, Role } from '@prisma/client'
import { AuthenticatedUser } from '../common/authenticated-user'
import { PanelGateway } from '../panel/panel.gateway'

@Injectable()
export class CounterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly panelGateway: PanelGateway,
  ) {}

  listForER(user: AuthenticatedUser) {
    if (!user.erId) throw new ForbiddenException('Usuário não vinculado a um ER')
    return this.prisma.counter.findMany({
      where: { erId: user.erId },
      orderBy: { number: 'asc' },
      include: { operator: { select: { id: true, name: true } } },
    })
  }

  async openCounter(counterId: string, user: AuthenticatedUser) {
    this._assertOperator(user)
    const counter = await this._getCounter(counterId)
    this._assertERAccess(counter.erId, user)
    if (counter.operatorId && counter.operatorId !== user.userId) {
      throw new ConflictException('O caixa está atribuído a outra operadora')
    }
    if (counter.state !== CounterState.UNAVAILABLE) {
      throw new ConflictException('O caixa já está aberto')
    }

    const otherCounter = await this.prisma.counter.findFirst({
      where: {
        operatorId: user.userId,
        id: { not: counterId },
        state: { not: CounterState.UNAVAILABLE },
      },
    })
    if (otherCounter) {
      throw new ConflictException('A operadora já possui outro caixa aberto')
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.counter.update({
        where: { id: counterId },
        data: { state: CounterState.ACTIVE, operatorId: user.userId },
      })
      await tx.auditEvent.create({
        data: {
          eventType: 'counter_assigned',
          erId: counter.erId,
          operatorId: user.userId,
          metadata: { counterId, counterNumber: counter.number },
        },
      })
      await tx.auditEvent.create({
        data: {
          eventType: 'counter_opened',
          erId: counter.erId,
          operatorId: user.userId,
          metadata: { counterId, counterNumber: counter.number },
        },
      })
      return result
    })

    this.panelGateway.emitToER(counter.erId, 'counter.opened', {
      counterId,
      number: counter.number,
    })
    return updated
  }

  async pauseCounter(counterId: string, user: AuthenticatedUser, reason: string) {
    this._assertOperator(user)
    const counter = await this._getCounter(counterId)
    this._assertERAccess(counter.erId, user)
    if (counter.operatorId !== user.userId) {
      throw new BadRequestException('O caixa pertence a outra operadora')
    }
    if (counter.state !== CounterState.ACTIVE) {
      throw new BadRequestException('O caixa deve estar ativo para ser pausado')
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.counter.update({
        where: { id: counterId },
        data: { state: CounterState.PAUSED },
      })
      await tx.auditEvent.create({
        data: {
          eventType: 'counter_paused',
          erId: counter.erId,
          operatorId: user.userId,
          metadata: { counterId, counterNumber: counter.number, reason },
        },
      })
      return result
    })

    this.panelGateway.emitToER(counter.erId, 'counter.paused', {
      counterId,
      number: counter.number,
      reason,
    })
    return updated
  }

  async resumeCounter(counterId: string, user: AuthenticatedUser) {
    this._assertOperator(user)
    const counter = await this._getCounter(counterId)
    this._assertERAccess(counter.erId, user)
    if (counter.operatorId !== user.userId) {
      throw new BadRequestException('O caixa pertence a outra operadora')
    }
    if (counter.state !== CounterState.PAUSED) {
      throw new BadRequestException('O caixa deve estar pausado para ser retomado')
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.counter.update({
        where: { id: counterId },
        data: { state: CounterState.ACTIVE },
      })
      await tx.auditEvent.create({
        data: {
          eventType: 'counter_resumed',
          erId: counter.erId,
          operatorId: user.userId,
          metadata: { counterId, counterNumber: counter.number },
        },
      })
      return result
    })

    this.panelGateway.emitToER(counter.erId, 'counter.resumed', {
      counterId,
      number: counter.number,
    })
    return updated
  }

  async closeCounter(counterId: string, user: AuthenticatedUser) {
    this._assertOperator(user)
    const counter = await this._getCounter(counterId)
    this._assertERAccess(counter.erId, user)
    if (counter.operatorId !== user.userId) {
      throw new BadRequestException('O caixa pertence a outra operadora')
    }
    if (
      ![CounterState.ACTIVE, CounterState.PAUSED].includes(counter.state as 'ACTIVE' | 'PAUSED')
    ) {
      throw new BadRequestException('O caixa não pode ser fechado com uma senha em aberto')
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const openTicket = await tx.ticket.findFirst({
        where: {
          counterId,
          state: { in: ['CALLING', 'IN_SERVICE'] },
        },
        select: { id: true },
      })
      if (openTicket) {
        throw new BadRequestException('O caixa não pode ser fechado com uma senha em aberto')
      }

      const result = await tx.counter.update({
        where: { id: counterId },
        data: { state: CounterState.UNAVAILABLE, operatorId: null },
      })
      await tx.auditEvent.create({
        data: {
          eventType: 'counter_closed',
          erId: counter.erId,
          operatorId: user.userId,
          metadata: { counterId, counterNumber: counter.number },
        },
      })
      return result
    })

    this.panelGateway.emitToER(counter.erId, 'counter.closed', {
      counterId,
      number: counter.number,
    })
    return updated
  }

  private async _getCounter(counterId: string) {
    const counter = await this.prisma.counter.findUnique({ where: { id: counterId } })
    if (!counter) throw new NotFoundException('Caixa não encontrado')
    return counter
  }

  private _assertERAccess(erId: string, user: AuthenticatedUser) {
    if (!user.erId || user.erId !== erId) {
      throw new ForbiddenException('Não é possível operar um caixa de outro ER')
    }
  }

  private _assertOperator(user: AuthenticatedUser) {
    if (user.role !== Role.OPERATOR) {
      throw new ForbiddenException('Somente operadoras podem operar caixas')
    }
  }
}
