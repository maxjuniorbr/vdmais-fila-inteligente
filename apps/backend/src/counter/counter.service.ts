import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CounterState, Prisma, Role, TicketState } from '@prisma/client'
import { AuthenticatedUser } from '../common/authenticated-user'
import { PanelGateway } from '../panel/panel.gateway'
import { CounterPauseReason } from './dto/pause-counter.dto'

@Injectable()
export class CounterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly panelGateway: PanelGateway,
  ) {}

  listForER(user: AuthenticatedUser) {
    if (!user.erId) throw new ForbiddenException('Conta não vinculada a um ER')
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
    const er = await this.prisma.eR.findUnique({
      where: { id: counter.erId },
      select: { isDayOpen: true },
    })
    if (!er?.isDayOpen) {
      throw new BadRequestException('Abra a operação do dia antes de abrir o caixa')
    }
    if (counter.operatorId && counter.operatorId !== user.userId) {
      throw new ConflictException('O caixa está atribuído a outro(a) operador(a)')
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
      throw new ConflictException('O(a) operador(a) já possui outro caixa aberto')
    }

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const assignment = await tx.counter.updateMany({
          where: {
            id: counterId,
            state: CounterState.UNAVAILABLE,
            operatorId: null,
          },
          data: { state: CounterState.ACTIVE, operatorId: user.userId },
        })
        if (assignment.count !== 1) {
          throw new ConflictException('O caixa já está aberto')
        }

        const result = await tx.counter.findUniqueOrThrow({ where: { id: counterId } })
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
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('O(a) operador(a) já possui outro caixa aberto')
      }
      throw error
    }
  }

  async pauseCounter(
    counterId: string,
    user: AuthenticatedUser,
    reason: CounterPauseReason,
    detail?: string,
  ) {
    this._assertOperator(user)
    // "outro" exige um detalhe livre; os demais motivos são autoexplicativos.
    const trimmedDetail = detail?.trim()
    if (reason === 'outro' && !trimmedDetail) {
      throw new BadRequestException('Descreva o motivo da pausa.')
    }
    const counter = await this._getCounter(counterId)
    this._assertERAccess(counter.erId, user)
    if (counter.operatorId !== user.userId) {
      throw new BadRequestException('O caixa pertence a outro(a) operador(a)')
    }
    if (counter.state !== CounterState.ACTIVE) {
      throw new BadRequestException('O caixa deve estar ativo para ser pausado')
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      // Compare-and-swap inside the transaction: the state read above is outside
      // it, so guard the write against a concurrent transition (e.g. callNext
      // moving the counter to CALLING) instead of forcing the state blindly.
      const changed = await tx.counter.updateMany({
        where: { id: counterId, operatorId: user.userId, state: CounterState.ACTIVE },
        data: { state: CounterState.PAUSED },
      })
      if (changed.count !== 1) {
        throw new BadRequestException('O caixa deve estar ativo para ser pausado')
      }
      await tx.auditEvent.create({
        data: {
          eventType: 'counter_paused',
          erId: counter.erId,
          operatorId: user.userId,
          metadata: {
            counterId,
            counterNumber: counter.number,
            reason,
            ...(trimmedDetail ? { detail: trimmedDetail } : {}),
          },
        },
      })
      return tx.counter.findUniqueOrThrow({ where: { id: counterId } })
    })

    this.panelGateway.emitToER(counter.erId, 'counter.paused', {
      counterId,
      number: counter.number,
      reason,
      ...(trimmedDetail ? { detail: trimmedDetail } : {}),
    })
    return updated
  }

  async resumeCounter(counterId: string, user: AuthenticatedUser) {
    this._assertOperator(user)
    const counter = await this._getCounter(counterId)
    this._assertERAccess(counter.erId, user)
    if (counter.operatorId !== user.userId) {
      throw new BadRequestException('O caixa pertence a outro(a) operador(a)')
    }
    if (counter.state !== CounterState.PAUSED) {
      throw new BadRequestException('O caixa deve estar pausado para ser retomado')
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.counter.updateMany({
        where: { id: counterId, operatorId: user.userId, state: CounterState.PAUSED },
        data: { state: CounterState.ACTIVE },
      })
      if (changed.count !== 1) {
        throw new BadRequestException('O caixa deve estar pausado para ser retomado')
      }
      await tx.auditEvent.create({
        data: {
          eventType: 'counter_resumed',
          erId: counter.erId,
          operatorId: user.userId,
          metadata: { counterId, counterNumber: counter.number },
        },
      })
      return tx.counter.findUniqueOrThrow({ where: { id: counterId } })
    })

    this.panelGateway.emitToER(counter.erId, 'counter.resumed', {
      counterId,
      number: counter.number,
    })
    return updated
  }

  /**
   * Liberação forçada por gestora/admin: usada quando uma operadora abandona o
   * caixa (saiu sem fechar, sessão expirou) deixando-o preso. Resolve a senha
   * em aberto (em atendimento → finalizada; em chamada → não compareceu) e
   * devolve o caixa ao estado disponível, sem operadora.
   */
  async forceReleaseCounter(counterId: string, user: AuthenticatedUser) {
    this._assertStaffERAccess(user)
    const counter = await this._getCounter(counterId)
    this._assertStaffERForCounter(counter.erId, user)

    const updated = await this.prisma.$transaction(async (tx) => {
      const now = new Date()
      const openTicket = await tx.ticket.findFirst({
        where: { counterId, state: { in: [TicketState.CALLING, TicketState.IN_SERVICE] } },
        select: { id: true, state: true, code: true },
      })

      if (openTicket) {
        const finishing = openTicket.state === TicketState.IN_SERVICE
        await tx.ticket.update({
          where: { id: openTicket.id },
          data: finishing
            ? { state: TicketState.FINISHED, serviceFinishedAt: now }
            : { state: TicketState.NO_SHOW, noShowAt: now },
        })
        await tx.auditEvent.create({
          data: {
            eventType: finishing ? 'service_force_finished' : 'ticket_marked_no_show',
            erId: counter.erId,
            ticketId: openTicket.id,
            operatorId: user.userId,
            metadata: { forced: true, reason: 'counter_force_release', counterId },
          },
        })
      }

      const result = await tx.counter.update({
        where: { id: counterId },
        data: { state: CounterState.UNAVAILABLE, operatorId: null },
      })
      await tx.auditEvent.create({
        data: {
          eventType: 'counter_force_released',
          erId: counter.erId,
          operatorId: user.userId,
          metadata: { counterId, counterNumber: counter.number, hadOpenTicket: Boolean(openTicket) },
        },
      })
      return { counter: result, openTicket }
    })

    if (updated.openTicket) {
      const finishing = updated.openTicket.state === TicketState.IN_SERVICE
      this.panelGateway.emitToER(
        counter.erId,
        finishing ? 'ticket.service_finished' : 'ticket.no_show',
        { ticketId: updated.openTicket.id, code: updated.openTicket.code },
      )
    }
    this.panelGateway.emitToER(counter.erId, 'counter.closed', {
      counterId,
      number: counter.number,
    })
    return updated.counter
  }

  async closeCounter(counterId: string, user: AuthenticatedUser) {
    this._assertOperator(user)
    const counter = await this._getCounter(counterId)
    this._assertERAccess(counter.erId, user)
    if (counter.operatorId !== user.userId) {
      throw new BadRequestException('O caixa pertence a outro(a) operador(a)')
    }
    const closeableStates: CounterState[] = [CounterState.ACTIVE, CounterState.PAUSED]
    if (!closeableStates.includes(counter.state)) {
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

      // Compare-and-swap: only close while still ACTIVE/PAUSED and owned, so a
      // concurrent call (counter → CALLING) cannot be silently overwritten.
      const changed = await tx.counter.updateMany({
        where: { id: counterId, operatorId: user.userId, state: { in: closeableStates } },
        data: { state: CounterState.UNAVAILABLE, operatorId: null },
      })
      if (changed.count !== 1) {
        throw new BadRequestException('O caixa não pode ser fechado com uma senha em aberto')
      }
      await tx.auditEvent.create({
        data: {
          eventType: 'counter_closed',
          erId: counter.erId,
          operatorId: user.userId,
          metadata: { counterId, counterNumber: counter.number },
        },
      })
      return tx.counter.findUniqueOrThrow({ where: { id: counterId } })
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
      throw new ForbiddenException('Somente operadores(as) podem operar caixas')
    }
  }

  private _assertStaffERAccess(user: AuthenticatedUser) {
    if (user.role !== Role.MANAGER && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Somente gestores(as) podem liberar caixas')
    }
  }

  private _assertStaffERForCounter(erId: string, user: AuthenticatedUser) {
    if (user.role === Role.ADMIN) return
    if (!user.erId || user.erId !== erId) {
      throw new ForbiddenException('Não é possível operar um caixa de outro ER')
    }
  }
}
