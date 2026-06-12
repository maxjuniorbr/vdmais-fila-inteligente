import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import { CounterState, EntryChannel, Prisma, Role, TicketState } from '@prisma/client'
import { AuthenticatedUser } from '../common/authenticated-user'
import { getBusinessDate } from '../common/business-date'
import { PanelGateway } from '../panel/panel.gateway'
import { abbreviateName } from '../panel/panel.presenter'
import { PrismaService } from '../prisma/prisma.service'
import { CreateTicketDto } from './dto/create-ticket.dto'
import { CorrectionAction, CorrectTicketDto } from './dto/ticket-action.dto'

const ACTIVE_STATES: TicketState[] = [
  TicketState.WAITING,
  TicketState.CALLING,
  TicketState.IN_SERVICE,
  TicketState.PAUSED,
]

@Injectable()
export class TicketService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly panelGateway: PanelGateway,
  ) {}

  async create(user: AuthenticatedUser, dto: CreateTicketDto) {
    const { representativeId, checkinAttendantId } = this._resolveTicketOwner(user, dto)
    const businessDate = getBusinessDate()

    try {
      const outcome = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT "id"
          FROM "ers"
          WHERE "id" = ${dto.erId}
          FOR UPDATE
        `
        const [er, representative] = await Promise.all([
          tx.eR.findUnique({ where: { id: dto.erId } }),
          tx.representative.findUnique({
            where: { id: representativeId },
            select: { id: true, fullName: true },
          }),
        ])
        if (!er) throw new NotFoundException('ER não encontrado')
        if (!representative) throw new NotFoundException('Representante não encontrada')
        if (!er.isDayOpen) {
          throw new BadRequestException('A operação do ER está encerrada hoje')
        }

        await tx.auditEvent.create({
          data: {
            eventType: 'ticket_creation_requested',
            erId: dto.erId,
            representativeId,
            operatorId: checkinAttendantId,
            metadata: { entryChannel: dto.entryChannel },
          },
        })

        const active = await tx.ticket.findFirst({
          where: {
            erId: dto.erId,
            representativeId,
            state: { in: ACTIVE_STATES },
          },
          select: { code: true },
        })
        await tx.auditEvent.create({
          data: {
            eventType: 'duplicate_ticket_checked',
            erId: dto.erId,
            representativeId,
            operatorId: checkinAttendantId,
            metadata: { duplicateFound: Boolean(active) },
          },
        })
        if (active) {
          await tx.auditEvent.create({
            data: {
              eventType: 'duplicate_ticket_blocked',
              erId: dto.erId,
              representativeId,
              operatorId: checkinAttendantId,
              metadata: { activeTicketCode: active.code },
            },
          })
          return { duplicateCode: active.code }
        }

        const queue = await tx.queue.upsert({
          where: { erId_businessDate: { erId: dto.erId, businessDate } },
          create: {
            erId: dto.erId,
            businessDate,
            openedAt: er.dayOpenedAt ?? new Date(),
            nextSequence: 1,
          },
          update: { nextSequence: { increment: 1 } },
          select: { id: true, nextSequence: true },
        })

        const ticket = await tx.ticket.create({
          data: {
            code: this._generateCode(queue.nextSequence),
            erId: dto.erId,
            queueId: queue.id,
            representativeId,
            entryChannel: dto.entryChannel,
            queuePosition: queue.nextSequence,
            checkinAttendantId,
          },
        })

        await tx.auditEvent.create({
          data: {
            eventType: 'ticket_created',
            erId: dto.erId,
            ticketId: ticket.id,
            representativeId,
            operatorId: checkinAttendantId,
            metadata: {
              code: ticket.code,
              entryChannel: dto.entryChannel,
              checkinAttendantId,
            },
          },
        })
        if (dto.entryChannel === EntryChannel.CHECKIN_ASSISTED) {
          await tx.auditEvent.create({
            data: {
              eventType: 'manual_checkin_completed',
              erId: dto.erId,
              ticketId: ticket.id,
              representativeId,
              operatorId: checkinAttendantId,
            },
          })
        }
        const currentPosition = await tx.ticket.count({
          where: {
            queueId: queue.id,
            state: TicketState.WAITING,
            queuePosition: { lte: ticket.queuePosition },
          },
        })
        return {
          ticket: {
            ...ticket,
            representative: { fullName: representative.fullName },
            currentPosition,
          },
        }
      })

      if ('duplicateCode' in outcome) {
        throw new ConflictException(`Já existe uma senha ativa: ${outcome.duplicateCode}`)
      }
      const { ticket } = outcome
      this.panelGateway.emitToER(dto.erId, 'ticket.created', {
        ticketId: ticket.id,
        code: ticket.code,
        queuePosition: ticket.currentPosition,
      })
      return ticket
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        await this._recordConcurrentDuplicate(dto.erId, representativeId, checkinAttendantId)
        throw new ConflictException('A representante já possui uma senha ativa neste ER')
      }
      throw error
    }
  }

  async selfCancel(ticketId: string, representativeId: string) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.findUnique({ where: { id: ticketId } })
      if (!ticket) throw new NotFoundException('Senha não encontrada')
      if (ticket.representativeId !== representativeId) {
        throw new ForbiddenException('Esta senha não pertence a você')
      }
      if (ticket.state !== TicketState.WAITING && ticket.state !== TicketState.PAUSED) {
        throw new BadRequestException(
          'Somente senhas aguardando ou pausadas podem ser canceladas pela representante',
        )
      }

      const result = await tx.ticket.update({
        where: { id: ticketId },
        data: {
          state: TicketState.CANCELLED,
          cancelReason: 'Desistência da representante',
          cancelledAt: new Date(),
        },
      })

      await tx.auditEvent.create({
        data: {
          eventType: 'ticket_cancelled',
          erId: ticket.erId,
          ticketId,
          representativeId,
          metadata: { reason: 'Desistência da representante', selfCancelled: true },
        },
      })
      return result
    })

    this.panelGateway.emitToER(updated.erId, 'ticket.cancelled', {
      ticketId,
      code: updated.code,
    })
    return updated
  }

  async cancel(ticketId: string, reason: string, user: AuthenticatedUser) {
    if (user.role !== Role.ATTENDANT && user.role !== Role.MANAGER && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Este perfil não pode cancelar senhas')
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "id"
        FROM "tickets"
        WHERE "id" = ${ticketId}
        FOR UPDATE
      `
      const ticket = await tx.ticket.findUnique({ where: { id: ticketId } })
      if (!ticket) throw new NotFoundException('Senha não encontrada')
      this._assertStaffER(ticket.erId, user)
      if (!ACTIVE_STATES.includes(ticket.state)) {
        throw new BadRequestException('A senha não pode ser cancelada no estado atual')
      }

      const result = await tx.ticket.update({
        where: { id: ticketId },
        data: {
          state: TicketState.CANCELLED,
          cancelReason: reason.trim(),
          cancelledAt: new Date(),
        },
      })

      if (ticket.counterId) {
        await tx.counter.update({
          where: { id: ticket.counterId },
          data: { state: CounterState.ACTIVE },
        })
      }

      await tx.auditEvent.create({
        data: {
          eventType: 'ticket_cancelled',
          erId: ticket.erId,
          ticketId,
          operatorId: user.userId,
          metadata: { reason: reason.trim() },
        },
      })
      return result
    })

    this.panelGateway.emitToER(updated.erId, 'ticket.cancelled', {
      ticketId,
      code: updated.code,
    })
    return updated
  }

  async restore(ticketId: string, reason: string, user: AuthenticatedUser) {
    if (user.role !== Role.MANAGER && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Somente gestoras podem restaurar senhas')
    }
    const ticket = await this._getTicket(ticketId)
    this._assertStaffER(ticket.erId, user)
    if (ticket.state === TicketState.CANCELLED && ticket.serviceStartedAt) {
      throw new BadRequestException(
        'Senhas canceladas após o início do atendimento não podem ser restauradas',
      )
    }
    await this.prisma.auditEvent.create({
      data: {
        eventType: 'ticket_restoration_requested',
        erId: ticket.erId,
        ticketId,
        operatorId: user.userId,
        metadata: { reason: reason.trim(), fromState: ticket.state },
      },
    })
    const businessDate = getBusinessDate()

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT "id"
          FROM "ers"
          WHERE "id" = ${ticket.erId}
          FOR UPDATE
        `
        const er = await tx.eR.findUnique({ where: { id: ticket.erId } })
        if (!er?.isDayOpen) {
          throw new BadRequestException('A operação do ER está encerrada hoje')
        }

        // Mantém a invariante central: uma RE não pode ter duas senhas ativas
        // no mesmo ER. Vale tanto para restaurar NO_SHOW quanto CANCELLED.
        const existingActive = await tx.ticket.findFirst({
          where: {
            erId: ticket.erId,
            representativeId: ticket.representativeId,
            id: { not: ticketId },
            state: { in: ACTIVE_STATES },
          },
          select: { code: true },
        })
        if (existingActive) {
          throw new ConflictException(
            `A representante já possui uma senha ativa: ${existingActive.code}`,
          )
        }

        const queue = await tx.queue.upsert({
          where: { erId_businessDate: { erId: ticket.erId, businessDate } },
          create: {
            erId: ticket.erId,
            businessDate,
            openedAt: er.dayOpenedAt ?? new Date(),
            nextSequence: 1,
          },
          update: { nextSequence: { increment: 1 } },
          select: { id: true, nextSequence: true },
        })

        const result = await tx.ticket.updateMany({
          where: {
            id: ticketId,
            OR: [
              { state: TicketState.NO_SHOW },
              { state: TicketState.CANCELLED, serviceStartedAt: null },
            ],
          },
          data: {
            state: TicketState.WAITING,
            queueId: queue.id,
            queuePosition: queue.nextSequence,
            restoreReason: reason.trim(),
            noShowAt: null,
            cancelledAt: null,
            cancelReason: null,
            counterId: null,
            operatorId: null,
            calledAt: null,
            serviceStartedAt: null,
            serviceFinishedAt: null,
          },
        })
        if (result.count !== 1) {
          throw new BadRequestException(
            'Somente senhas não comparecidas ou canceladas antes do atendimento podem ser restauradas',
          )
        }

        await tx.auditEvent.create({
          data: {
            eventType: 'ticket_restored',
            erId: ticket.erId,
            ticketId,
            operatorId: user.userId,
            metadata: { reason: reason.trim(), fromState: ticket.state },
          },
        })
        return tx.ticket.findUniqueOrThrow({ where: { id: ticketId } })
      })

      this.panelGateway.emitToER(ticket.erId, 'ticket.restored', {
        ticketId,
        code: ticket.code,
        queuePosition: updated.queuePosition,
      })
      return updated
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A representante já possui uma senha ativa neste ER')
      }
      throw error
    }
  }

  async recall(ticketId: string, user: AuthenticatedUser) {
    if (user.role !== Role.OPERATOR) {
      throw new ForbiddenException('Somente operadoras podem rechamar senhas')
    }
    const ticket = await this._getTicket(ticketId)
    this._assertAssignedOperator(ticket, user)
    const now = new Date()

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.ticket.updateMany({
        where: { id: ticketId, state: TicketState.CALLING, operatorId: user.userId },
        data: { calledAt: now },
      })
      if (result.count !== 1) {
        throw new BadRequestException('A senha deve estar em chamada para ser rechamada')
      }

      await tx.auditEvent.create({
        data: {
          eventType: 'ticket_recalled',
          erId: ticket.erId,
          ticketId,
          operatorId: user.userId,
          metadata: { counterId: ticket.counterId },
        },
      })
      return tx.ticket.findUniqueOrThrow({
        where: { id: ticketId },
        include: {
          representative: { select: { fullName: true } },
          counter: { select: { number: true } },
        },
      })
    })

    // Reaproveita o evento 'ticket.called' (já tratado pelos clientes) para
    // re-destacar a senha no painel — o painel não precisa de ajuste.
    this.panelGateway.emitToER(ticket.erId, 'ticket.called', {
      ticketId,
      code: updated.code,
      displayName: abbreviateName(updated.representative.fullName),
      counterNumber: updated.counter?.number ?? 0,
      calledAt: updated.calledAt,
    })
    return updated
  }

  async startService(ticketId: string, user: AuthenticatedUser) {
    if (user.role !== Role.OPERATOR) {
      throw new ForbiddenException('Somente operadoras podem iniciar atendimentos')
    }
    const ticket = await this._getTicket(ticketId)
    this._assertAssignedOperator(ticket, user)
    const now = new Date()

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.ticket.updateMany({
        where: {
          id: ticketId,
          state: TicketState.CALLING,
          operatorId: user.userId,
        },
        data: { state: TicketState.IN_SERVICE, serviceStartedAt: now },
      })
      if (result.count !== 1) {
        throw new BadRequestException('A senha deve estar em chamada para iniciar o atendimento')
      }

      await tx.counter.update({
        where: { id: ticket.counterId! },
        data: { state: CounterState.IN_SERVICE },
      })
      await tx.auditEvent.create({
        data: {
          eventType: 'service_started',
          erId: ticket.erId,
          ticketId,
          operatorId: user.userId,
          metadata: { counterId: ticket.counterId },
        },
      })
      return tx.ticket.findUniqueOrThrow({
        where: { id: ticketId },
        include: { counter: { select: { number: true } } },
      })
    })

    this.panelGateway.emitToER(ticket.erId, 'ticket.service_started', {
      ticketId,
      code: ticket.code,
      counterNumber: updated.counter?.number ?? 0,
    })
    return updated
  }

  async finishService(ticketId: string, user: AuthenticatedUser) {
    if (user.role !== Role.OPERATOR) {
      throw new ForbiddenException('Somente operadoras podem finalizar atendimentos')
    }
    return this._completeOperatorTicket(ticketId, user, TicketState.FINISHED)
  }

  async noShow(ticketId: string, user: AuthenticatedUser) {
    if (user.role !== Role.OPERATOR) {
      throw new ForbiddenException('Somente operadoras podem registrar não comparecimento')
    }
    return this._completeOperatorTicket(ticketId, user, TicketState.NO_SHOW)
  }

  async correct(ticketId: string, dto: CorrectTicketDto, user: AuthenticatedUser) {
    if (user.role !== Role.MANAGER && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Somente gestoras podem corrigir senhas')
    }
    const ticket = await this._getTicket(ticketId)
    this._assertStaffER(ticket.erId, user)
    if (ticket.state !== TicketState.IN_SERVICE) {
      throw new BadRequestException('Somente uma senha em atendimento pode ser corrigida')
    }

    const now = new Date()
    const targetState =
      dto.action === CorrectionAction.FINISH ? TicketState.FINISHED : TicketState.CANCELLED
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.ticket.updateMany({
        where: { id: ticketId, state: TicketState.IN_SERVICE },
        data:
          targetState === TicketState.FINISHED
            ? { state: targetState, serviceFinishedAt: now }
            : {
                state: targetState,
                cancelledAt: now,
                cancelReason: dto.reason.trim(),
              },
      })
      if (result.count !== 1) {
        throw new ConflictException('O estado da senha foi alterado')
      }

      if (ticket.counterId) {
        await tx.counter.update({
          where: { id: ticket.counterId },
          data: { state: CounterState.ACTIVE },
        })
      }
      await tx.auditEvent.create({
        data: {
          eventType: 'manual_override_performed',
          erId: ticket.erId,
          ticketId,
          operatorId: user.userId,
          metadata: {
            reason: dto.reason.trim(),
            action: dto.action,
            counterId: ticket.counterId,
          },
        },
      })
      await tx.auditEvent.create({
        data: {
          eventType: targetState === TicketState.FINISHED ? 'service_finished' : 'ticket_cancelled',
          erId: ticket.erId,
          ticketId,
          operatorId: user.userId,
          metadata: {
            reason: dto.reason.trim(),
            correction: true,
            counterId: ticket.counterId,
          },
        },
      })
      return tx.ticket.findUniqueOrThrow({ where: { id: ticketId } })
    })

    this.panelGateway.emitToER(
      ticket.erId,
      targetState === TicketState.FINISHED ? 'ticket.service_finished' : 'ticket.cancelled',
      { ticketId, code: ticket.code, correction: true },
    )
    return updated
  }

  async getMyActiveTicket(representativeId: string, erId: string) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { representativeId, erId, state: { in: ACTIVE_STATES } },
      include: {
        representative: { select: { fullName: true } },
        er: { select: { pauseTimeoutSeconds: true } },
      },
    })
    if (!ticket) throw new NotFoundException('Nenhuma senha ativa encontrada para este ER')

    // Enforce the pause timeout on read so the RE sees the cancellation
    // promptly even before the periodic sweep runs.
    if (this._isPauseExpired(ticket.state, ticket.pausedAt, ticket.er.pauseTimeoutSeconds)) {
      await this._expirePause({
        id: ticket.id,
        code: ticket.code,
        erId: ticket.erId,
        representativeId: ticket.representativeId,
      })
      throw new NotFoundException('Nenhuma senha ativa encontrada para este ER')
    }

    const currentPosition =
      ticket.state === TicketState.WAITING
        ? await this.prisma.ticket.count({
            where: {
              queueId: ticket.queueId,
              state: TicketState.WAITING,
              queuePosition: { lte: ticket.queuePosition },
            },
          })
        : 0
    const { er, ...rest } = ticket
    return { ...rest, currentPosition, pauseTimeoutSeconds: er.pauseTimeoutSeconds }
  }

  private _isPauseExpired(
    state: TicketState,
    pausedAt: Date | null,
    pauseTimeoutSeconds: number,
  ): boolean {
    if (state !== TicketState.PAUSED || !pausedAt || pauseTimeoutSeconds <= 0) return false
    return Date.now() >= pausedAt.getTime() + pauseTimeoutSeconds * 1000
  }

  /**
   * Periodically cancels paused ("não estou pronta") tickets that exceeded the
   * ER's configured pause timeout. This is the authoritative enforcement and
   * works even when the RE has closed her queue card.
   */
  @Interval('expire-stale-pauses', 15000)
  async expireStalePauses() {
    const candidates = await this.prisma.ticket.findMany({
      where: {
        state: TicketState.PAUSED,
        pausedAt: { not: null },
        er: { pauseTimeoutSeconds: { gt: 0 } },
      },
      select: {
        id: true,
        code: true,
        erId: true,
        pausedAt: true,
        representativeId: true,
        er: { select: { pauseTimeoutSeconds: true } },
      },
    })

    for (const ticket of candidates) {
      if (this._isPauseExpired(TicketState.PAUSED, ticket.pausedAt, ticket.er.pauseTimeoutSeconds)) {
        await this._expirePause(ticket)
      }
    }
  }

  private async _expirePause(ticket: {
    id: string
    code: string
    erId: string
    representativeId: string
  }) {
    const cancelled = await this.prisma.$transaction(async (tx) => {
      const result = await tx.ticket.updateMany({
        where: { id: ticket.id, state: TicketState.PAUSED },
        data: {
          state: TicketState.CANCELLED,
          cancelReason: 'Tempo de pausa esgotado',
          cancelledAt: new Date(),
        },
      })
      if (result.count !== 1) return false

      await tx.auditEvent.create({
        data: {
          eventType: 'ticket_pause_expired',
          erId: ticket.erId,
          ticketId: ticket.id,
          representativeId: ticket.representativeId,
        },
      })
      await tx.auditEvent.create({
        data: {
          eventType: 'ticket_cancelled',
          erId: ticket.erId,
          ticketId: ticket.id,
          representativeId: ticket.representativeId,
          metadata: { reason: 'Tempo de pausa esgotado', pauseExpired: true },
        },
      })
      return true
    })

    if (cancelled) {
      this.panelGateway.emitToER(ticket.erId, 'ticket.cancelled', {
        ticketId: ticket.id,
        code: ticket.code,
      })
    }
  }

  async pauseTicket(ticketId: string, representativeId: string) {
    const ticket = await this._getTicket(ticketId)
    if (ticket.representativeId !== representativeId) {
      throw new ForbiddenException('Esta senha não pertence a você')
    }
    if (ticket.state !== TicketState.WAITING) {
      throw new BadRequestException('Somente senhas aguardando podem ser pausadas')
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.ticket.updateMany({
        where: { id: ticketId, state: TicketState.WAITING },
        data: { state: TicketState.PAUSED, pausedAt: new Date() },
      })
      if (result.count !== 1) {
        throw new BadRequestException('Não foi possível pausar a senha')
      }

      await tx.auditEvent.create({
        data: {
          eventType: 'ticket_paused',
          erId: ticket.erId,
          ticketId,
          representativeId,
        },
      })
      return tx.ticket.findUniqueOrThrow({
        where: { id: ticketId },
        include: {
          representative: { select: { fullName: true } },
          er: { select: { pauseTimeoutSeconds: true } },
        },
      })
    })

    this.panelGateway.emitToER(ticket.erId, 'ticket.paused', { ticketId, code: ticket.code })
    const { er, ...rest } = updated
    return { ...rest, currentPosition: 0, pauseTimeoutSeconds: er.pauseTimeoutSeconds }
  }

  async resumeTicket(ticketId: string, representativeId: string) {
    const ticket = await this._getTicket(ticketId)
    if (ticket.representativeId !== representativeId) {
      throw new ForbiddenException('Esta senha não pertence a você')
    }
    if (ticket.state !== TicketState.PAUSED) {
      throw new BadRequestException('Somente senhas pausadas podem ser retomadas')
    }
    const businessDate = getBusinessDate()

    const { updated, queueId } = await this.prisma.$transaction(async (tx) => {
      const now = new Date()
      const additionalPausedSeconds = ticket.pausedAt
        ? Math.round((now.getTime() - ticket.pausedAt.getTime()) / 1000)
        : 0

      const er = await tx.eR.findUnique({
        where: { id: ticket.erId },
        select: { dayOpenedAt: true },
      })

      // Sempre vincula à fila do dia ATUAL. Se a senha foi pausada num dia e
      // retomada em outro (operação que cruzou a meia-noite), ela migra para a
      // fila de hoje — caso contrário ficaria presa numa fila que o
      // `callNext` nunca consulta.
      const queue = await tx.queue.upsert({
        where: { erId_businessDate: { erId: ticket.erId, businessDate } },
        create: {
          erId: ticket.erId,
          businessDate,
          openedAt: er?.dayOpenedAt ?? now,
          nextSequence: 1,
        },
        update: { nextSequence: { increment: 1 } },
        select: { id: true, nextSequence: true },
      })

      const result = await tx.ticket.updateMany({
        where: { id: ticketId, state: TicketState.PAUSED },
        data: {
          state: TicketState.WAITING,
          queueId: queue.id,
          queuePosition: queue.nextSequence,
          code: this._generateCode(queue.nextSequence),
          pausedAt: null,
          pausedSeconds: { increment: additionalPausedSeconds },
        },
      })
      if (result.count !== 1) {
        throw new BadRequestException('Não foi possível retomar a senha')
      }

      await tx.auditEvent.create({
        data: {
          eventType: 'ticket_resumed',
          erId: ticket.erId,
          ticketId,
          representativeId,
          metadata: {
            newPosition: queue.nextSequence,
            pausedSeconds: additionalPausedSeconds,
            ...(queue.id === ticket.queueId ? {} : { migratedFromQueueId: ticket.queueId }),
          },
        },
      })
      const fresh = await tx.ticket.findUniqueOrThrow({
        where: { id: ticketId },
        include: { representative: { select: { fullName: true } } },
      })
      return { updated: fresh, queueId: queue.id }
    })

    const currentPosition = await this.prisma.ticket.count({
      where: {
        queueId,
        state: TicketState.WAITING,
        queuePosition: { lte: updated.queuePosition },
      },
    })

    this.panelGateway.emitToER(ticket.erId, 'ticket.created', {
      ticketId,
      code: updated.code,
      queuePosition: currentPosition,
    })
    return { ...updated, currentPosition }
  }

  private async _completeOperatorTicket(
    ticketId: string,
    user: AuthenticatedUser,
    targetState: 'FINISHED' | 'NO_SHOW',
  ) {
    const ticket = await this._getTicket(ticketId)
    this._assertAssignedOperator(ticket, user)
    const requiredState =
      targetState === TicketState.FINISHED ? TicketState.IN_SERVICE : TicketState.CALLING
    const now = new Date()

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.ticket.updateMany({
        where: { id: ticketId, state: requiredState, operatorId: user.userId },
        data:
          targetState === TicketState.FINISHED
            ? { state: targetState, serviceFinishedAt: now }
            : { state: targetState, noShowAt: now },
      })
      if (result.count !== 1) {
        throw new BadRequestException(
          targetState === TicketState.FINISHED
            ? 'A senha deve estar em atendimento para ser finalizada'
            : 'A senha deve estar em chamada para registrar não comparecimento',
        )
      }

      await tx.counter.update({
        where: { id: ticket.counterId! },
        data: { state: CounterState.ACTIVE },
      })
      await tx.auditEvent.create({
        data: {
          eventType:
            targetState === TicketState.FINISHED ? 'service_finished' : 'ticket_marked_no_show',
          erId: ticket.erId,
          ticketId,
          operatorId: user.userId,
          metadata: { counterId: ticket.counterId },
        },
      })
      return tx.ticket.findUniqueOrThrow({ where: { id: ticketId } })
    })

    this.panelGateway.emitToER(
      ticket.erId,
      targetState === TicketState.FINISHED ? 'ticket.service_finished' : 'ticket.no_show',
      { ticketId, code: ticket.code },
    )
    return updated
  }

  private _resolveTicketOwner(user: AuthenticatedUser, dto: CreateTicketDto) {
    if (user.role === Role.REPRESENTATIVE) {
      if (dto.representativeId && dto.representativeId !== user.userId) {
        throw new ForbiddenException('Representantes só podem criar a própria senha')
      }
      if (!user.erId || !user.entryChannel) {
        throw new ForbiddenException('Acesso à fila inválido ou expirado')
      }
      if (user.erId !== dto.erId) {
        throw new ForbiddenException('O acesso à fila pertence a outro ER')
      }
      if (user.entryChannel !== dto.entryChannel) {
        throw new ForbiddenException('O acesso à fila pertence a outro canal')
      }
      if (dto.entryChannel === EntryChannel.CHECKIN_ASSISTED) {
        throw new ForbiddenException('O check-in assistido requer uma atendente')
      }
      return { representativeId: user.userId, checkinAttendantId: undefined }
    }

    if (user.role !== Role.ATTENDANT) {
      throw new ForbiddenException('Este perfil não pode criar senhas')
    }
    if (!user.erId || user.erId !== dto.erId) {
      throw new ForbiddenException('Não é possível criar uma senha em outro ER')
    }
    if (dto.entryChannel !== EntryChannel.CHECKIN_ASSISTED || !dto.representativeId) {
      throw new BadRequestException(
        'O check-in assistido requer o canal apropriado e a identificação da representante',
      )
    }
    return {
      representativeId: dto.representativeId,
      checkinAttendantId: user.userId,
    }
  }

  private _assertAssignedOperator(
    ticket: Awaited<ReturnType<TicketService['_getTicket']>>,
    user: AuthenticatedUser,
  ) {
    this._assertStaffER(ticket.erId, user)
    if (!ticket.counterId || ticket.operatorId !== user.userId) {
      throw new ForbiddenException('A senha pertence a outra operadora')
    }
  }

  private _assertStaffER(erId: string, user: AuthenticatedUser) {
    if (user.role === Role.ADMIN) return
    if (!user.erId || user.erId !== erId) {
      throw new ForbiddenException('Não é possível gerenciar uma senha de outro ER')
    }
  }

  private async _getTicket(ticketId: string) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } })
    if (!ticket) throw new NotFoundException('Senha não encontrada')
    return ticket
  }

  private async _recordConcurrentDuplicate(
    erId: string,
    representativeId: string,
    operatorId?: string,
  ) {
    await this.prisma.$transaction([
      this.prisma.auditEvent.create({
        data: {
          eventType: 'duplicate_ticket_checked',
          erId,
          representativeId,
          operatorId,
          metadata: { duplicateFound: true, concurrent: true },
        },
      }),
      this.prisma.auditEvent.create({
        data: {
          eventType: 'duplicate_ticket_blocked',
          erId,
          representativeId,
          operatorId,
          metadata: { concurrent: true },
        },
      }),
    ])
  }

  private _generateCode(sequence: number): string {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const letter = letters[Math.floor((sequence - 1) / 999) % letters.length]
    const number = ((sequence - 1) % 999) + 1
    return `${letter}${String(number).padStart(3, '0')}`
  }
}
