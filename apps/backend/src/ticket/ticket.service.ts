import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import {
  CounterState,
  EntryChannel,
  Prisma,
  RepresentativeKind,
  Role,
  TicketState,
} from '@prisma/client'
import { AuthenticatedUser } from '../common/authenticated-user'
import { getBusinessDate } from '../common/business-date'
import { PanelGateway } from '../panel/panel.gateway'
import { abbreviateName } from '../panel/panel.presenter'
import { PrismaService } from '../prisma/prisma.service'
import { CreateTicketDto } from './dto/create-ticket.dto'
import { CorrectionAction, CorrectTicketDto } from './dto/ticket-action.dto'

export const ACTIVE_STATES: TicketState[] = [
  TicketState.WAITING,
  TicketState.CALLING,
  TicketState.IN_SERVICE,
  TicketState.PAUSED,
]

const REPRESENTATIVE_TICKET_INCLUDE = {
  representative: { select: { fullName: true } },
  er: { select: { pauseTimeoutSeconds: true, callTimeoutSeconds: true } },
} satisfies Prisma.TicketInclude

type RepresentativeTicket = Prisma.TicketGetPayload<{
  include: typeof REPRESENTATIVE_TICKET_INCLUDE
}>

export interface IntegrationActionContext {
  client?: string
  scopes?: string[]
  idempotencyKey?: string
}

export interface IntegrationActionResult {
  ticket: {
    id: string
    code: string
    erId: string
    state: TicketState
    serviceStartedAt: Date | null
    serviceFinishedAt: Date | null
  }
  idempotent: boolean
}

interface ServiceTransitionOptions {
  source: 'operator' | 'integration'
  restrictToOperatorId?: string
  client?: string
  scopes?: string[]
  idempotencyKey?: string
}

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
            select: { id: true, fullName: true, kind: true },
          }),
        ])
        if (!er) throw new NotFoundException('ER não encontrado')
        // A convidada autenticada entra na própria fila pelo mesmo papel
        // REPRESENTATIVE. O kind só deve barrar o fluxo assistido: atendentes não
        // podem selecionar registros leves de convidadas como se fossem cadastros.
        if (
          !representative ||
          (checkinAttendantId && representative.kind !== RepresentativeKind.REGISTERED)
        ) {
          throw new NotFoundException('Representante não encontrada')
        }
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

        // A própria representante não pode se marcar preferencial; só staff
        // (check-in assistido) pode entrar com a senha já preferencial.
        const isPriority = user.role === Role.REPRESENTATIVE ? false : (dto.isPriority ?? false)
        const ticket = await tx.ticket.create({
          data: {
            code: this._generateCode(queue.nextSequence),
            erId: dto.erId,
            queueId: queue.id,
            representativeId,
            entryChannel: dto.entryChannel,
            queuePosition: queue.nextSequence,
            isPriority,
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
              isPriority,
            },
          },
        })
        if (dto.entryChannel === EntryChannel.CHECKIN_ASSISTED) {
          await tx.auditEvent.create({
            data: {
              eventType: 'queue_entry_started',
              erId: dto.erId,
              ticketId: ticket.id,
              representativeId,
              operatorId: checkinAttendantId,
              metadata: { entryChannel: dto.entryChannel },
            },
          })
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
        const currentPosition = await this._waitingPositionCount(tx, ticket)
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
      // Lock the row so a concurrent callNext (WAITING → CALLING) cannot be
      // clobbered: without this, an unguarded update-by-id could overwrite a
      // just-called ticket back to CANCELLED and strand its counter in CALLING.
      await tx.$queryRaw`
        SELECT "id"
        FROM "tickets"
        WHERE "id" = ${ticketId}
        FOR UPDATE
      `
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

      const result = await tx.ticket.updateMany({
        where: { id: ticketId, state: { in: [TicketState.WAITING, TicketState.PAUSED] } },
        data: {
          state: TicketState.CANCELLED,
          cancelReason: 'Desistência da representante',
          cancelledAt: new Date(),
        },
      })
      if (result.count !== 1) {
        throw new BadRequestException(
          'Somente senhas aguardando ou pausadas podem ser canceladas pela representante',
        )
      }

      await tx.auditEvent.create({
        data: {
          eventType: 'ticket_cancelled',
          erId: ticket.erId,
          ticketId,
          representativeId,
          metadata: { reason: 'Desistência da representante', selfCancelled: true },
        },
      })
      return tx.ticket.findUniqueOrThrow({ where: { id: ticketId } })
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
      const refreshed = await tx.ticket.findUniqueOrThrow({
        where: { id: ticketId },
        include: {
          representative: { select: { fullName: true } },
          counter: { select: { number: true } },
        },
      })
      await tx.auditEvent.create({
        data: {
          eventType: 'ticket_call_displayed_on_panel',
          erId: ticket.erId,
          ticketId,
          operatorId: user.userId,
          metadata: {
            counterNumber: refreshed.counter?.number ?? 0,
            code: refreshed.code,
            via: 'recall',
          },
        },
      })
      return refreshed
    })

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
    return this._transitionToInService(ticket, {
      source: 'operator',
      restrictToOperatorId: user.userId,
    })
  }

  async finishService(ticketId: string, user: AuthenticatedUser) {
    if (user.role !== Role.OPERATOR) {
      throw new ForbiddenException('Somente operadoras podem finalizar atendimentos')
    }
    const ticket = await this._getTicket(ticketId)
    this._assertAssignedOperator(ticket, user)
    return this._transitionToFinished(ticket, {
      source: 'operator',
      restrictToOperatorId: user.userId,
    })
  }

  async noShow(ticketId: string, user: AuthenticatedUser) {
    if (user.role !== Role.OPERATOR) {
      throw new ForbiddenException('Somente operadoras podem registrar não comparecimento')
    }
    return this._markNoShow(ticketId, user)
  }

  // Chamado pela integração: avança em nome do serviço, sem validar posse de
  // operadora (diferente do fluxo da operadora). Idempotente se já IN_SERVICE.
  async advanceToInService(
    ticketId: string,
    ctx: IntegrationActionContext,
  ): Promise<IntegrationActionResult> {
    const ticket = await this._getTicket(ticketId)
    if (ticket.state === TicketState.IN_SERVICE) {
      return { ticket, idempotent: true }
    }
    if (ticket.state === TicketState.WAITING || ticket.state === TicketState.PAUSED) {
      throw new ConflictException({
        code: 'TICKET_NOT_CALLED',
        message: 'A senha ainda não foi chamada',
      })
    }
    if (ticket.state !== TicketState.CALLING) {
      throw new ConflictException({
        code: 'TICKET_ALREADY_CLOSED',
        message: 'A senha já foi encerrada',
      })
    }
    try {
      const updated = await this._transitionToInService(ticket, { source: 'integration', ...ctx })
      return { ticket: updated, idempotent: false }
    } catch (error) {
      return this._idempotentOnRace(error, ticketId, TicketState.IN_SERVICE)
    }
  }

  async completeService(
    ticketId: string,
    ctx: IntegrationActionContext,
  ): Promise<IntegrationActionResult> {
    const ticket = await this._getTicket(ticketId)
    if (ticket.state === TicketState.FINISHED) {
      return { ticket, idempotent: true }
    }
    if (
      ticket.state === TicketState.WAITING ||
      ticket.state === TicketState.CALLING ||
      ticket.state === TicketState.PAUSED
    ) {
      throw new ConflictException({
        code: 'TICKET_NOT_IN_SERVICE',
        message: 'A senha não está em atendimento',
      })
    }
    if (ticket.state !== TicketState.IN_SERVICE) {
      throw new ConflictException({
        code: 'TICKET_ALREADY_CLOSED',
        message: 'A senha já foi encerrada',
      })
    }
    try {
      const updated = await this._transitionToFinished(ticket, { source: 'integration', ...ctx })
      return { ticket: updated, idempotent: false }
    } catch (error) {
      return this._idempotentOnRace(error, ticketId, TicketState.FINISHED)
    }
  }

  // Quando duas chamadas concorrentes disputam a transição, o updateMany atômico
  // deixa uma vencer (count=1) e a outra falhar (count=0 → BadRequestException).
  // Se a senha já está no estado-alvo, a perdedora retorna idempotente em vez de 400.
  private async _idempotentOnRace(
    error: unknown,
    ticketId: string,
    targetState: TicketState,
  ): Promise<IntegrationActionResult> {
    if (error instanceof BadRequestException) {
      const fresh = await this._getTicket(ticketId)
      if (fresh.state === targetState) {
        return { ticket: fresh, idempotent: true }
      }
    }
    throw error
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
    // A missing erId would make Prisma drop the filter (erId: undefined) and
    // return a ticket from any ER. Require it explicitly.
    if (!erId) throw new BadRequestException('erId é obrigatório')
    const ticket = await this.prisma.ticket.findFirst({
      where: { representativeId, erId, state: { in: ACTIVE_STATES } },
      include: REPRESENTATIVE_TICKET_INCLUDE,
    })
    if (!ticket) throw new NotFoundException('Nenhuma senha ativa encontrada para este ER')

    // Enforce the pause/call timeouts on read so the RE sees the outcome
    // promptly even before the periodic sweeps run.
    if (this._isPauseExpired(ticket.state, ticket.pausedAt, ticket.er.pauseTimeoutSeconds)) {
      // Expirar a pausa agora RETOMA a senha (volta ao fim da fila) em vez de
      // cancelar, então ela continua ativa — re-busca e devolve já em AGUARDANDO.
      await this._expirePause(ticket)
      const refreshed = await this.prisma.ticket.findUniqueOrThrow({
        where: { id: ticket.id },
        include: REPRESENTATIVE_TICKET_INCLUDE,
      })
      // Em corrida (a senha saiu de PAUSED entre a leitura e a retomada — ex.: um
      // cancelamento concorrente), a retomada não acontece. Preserva o contrato do
      // endpoint: sem senha ATIVA, responde 404 em vez de devolver uma terminal.
      if (!ACTIVE_STATES.includes(refreshed.state)) {
        throw new NotFoundException('Nenhuma senha ativa encontrada para este ER')
      }
      return this._buildRepresentativeTicketView(refreshed)
    }
    if (this._isCallExpired(ticket.state, ticket.calledAt, ticket.er.callTimeoutSeconds)) {
      await this._expireCallTimeout(ticket)
      throw new NotFoundException('Nenhuma senha ativa encontrada para este ER')
    }

    return this._buildRepresentativeTicketView(ticket)
  }

  // Like getMyActiveTicket, but returns the representative's most recent ticket
  // for the ER in ANY state (NO_SHOW, CANCELLED, FINISHED, or a restored
  // WAITING). The RE's screen polls this to render the real status instead of
  // guessing it from a 404 — so a no-show no longer reads as "concluded" and a
  // manager restore brings the live status back.
  async getMyTicketStatus(representativeId: string, erId: string) {
    if (!erId) throw new BadRequestException('erId é obrigatório')
    const ticket = await this.prisma.ticket.findFirst({
      where: { representativeId, erId },
      orderBy: { createdAt: 'desc' },
      include: REPRESENTATIVE_TICKET_INCLUDE,
    })
    if (!ticket) throw new NotFoundException('Nenhuma senha encontrada para este ER')

    // Same pause/call timeout enforcement as getMyActiveTicket, but the RE keeps
    // seeing the resulting ticket instead of a 404: a pause that expired is now
    // RESUMED (back to WAITING), and a call that expired becomes NO_SHOW.
    const pauseExpired = this._isPauseExpired(
      ticket.state,
      ticket.pausedAt,
      ticket.er.pauseTimeoutSeconds,
    )
    const callExpired = this._isCallExpired(
      ticket.state,
      ticket.calledAt,
      ticket.er.callTimeoutSeconds,
    )
    if (pauseExpired || callExpired) {
      if (pauseExpired) {
        await this._expirePause(ticket)
      } else {
        await this._expireCallTimeout(ticket)
      }
      const refreshed = await this.prisma.ticket.findUniqueOrThrow({
        where: { id: ticket.id },
        include: REPRESENTATIVE_TICKET_INCLUDE,
      })
      return this._buildRepresentativeTicketView(refreshed)
    }

    return this._buildRepresentativeTicketView(ticket)
  }

  // Posição na fila ciente da prioridade. Preferenciais são chamadas antes das
  // normais (ORDER BY isPriority DESC, queuePosition ASC), então a posição é o nº
  // de senhas aguardando que vêm antes-ou-igual a esta nessa ordenação: toda
  // preferencial precede uma normal; dentro do mesmo grupo, ordena por queuePosition.
  private _waitingPositionCount(
    client: Prisma.TransactionClient,
    ticket: { queueId: string; isPriority: boolean; queuePosition: number },
  ): Promise<number> {
    const aheadBuckets: Prisma.TicketWhereInput[] = ticket.isPriority ? [] : [{ isPriority: true }]
    return client.ticket.count({
      where: {
        queueId: ticket.queueId,
        state: TicketState.WAITING,
        OR: [
          ...aheadBuckets,
          { isPriority: ticket.isPriority, queuePosition: { lte: ticket.queuePosition } },
        ],
      },
    })
  }

  private async _buildRepresentativeTicketView(ticket: RepresentativeTicket) {
    const currentPosition =
      ticket.state === TicketState.WAITING
        ? await this._waitingPositionCount(this.prisma, ticket)
        : 0
    const { er, ...rest } = ticket
    return {
      ...rest,
      currentPosition,
      pauseTimeoutSeconds: er.pauseTimeoutSeconds,
      callTimeoutSeconds: er.callTimeoutSeconds,
    }
  }

  private _isPauseExpired(
    state: TicketState,
    pausedAt: Date | null,
    pauseTimeoutSeconds: number,
  ): boolean {
    if (state !== TicketState.PAUSED || !pausedAt || pauseTimeoutSeconds <= 0) return false
    return Date.now() >= pausedAt.getTime() + pauseTimeoutSeconds * 1000
  }

  private _isCallExpired(
    state: TicketState,
    calledAt: Date | null,
    callTimeoutSeconds: number,
  ): boolean {
    if (state !== TicketState.CALLING || !calledAt || callTimeoutSeconds <= 0) return false
    return Date.now() >= calledAt.getTime() + callTimeoutSeconds * 1000
  }

  // Read-time counterpart of TicketTimeoutService.sweepExpiredCalls: marks this
  // called ticket as NO_SHOW and frees its counter once the ER's call tolerance
  // is exceeded, so the RE sees the no-show without waiting for the cron.
  private async _expireCallTimeout(ticket: {
    id: string
    code: string
    erId: string
    counterId: string | null
  }) {
    const expired = await this.prisma.$transaction(async (tx) => {
      const result = await tx.ticket.updateMany({
        where: { id: ticket.id, state: TicketState.CALLING },
        data: { state: TicketState.NO_SHOW, noShowAt: new Date() },
      })
      if (result.count !== 1) return false

      if (ticket.counterId) {
        await tx.counter.updateMany({
          where: { id: ticket.counterId, state: CounterState.CALLING },
          data: { state: CounterState.ACTIVE },
        })
      }

      await tx.auditEvent.create({
        data: {
          eventType: 'ticket_auto_no_show',
          erId: ticket.erId,
          ticketId: ticket.id,
          metadata: { counterId: ticket.counterId, reason: 'call_timeout' },
        },
      })
      return true
    })

    if (expired) {
      this.panelGateway.emitToER(ticket.erId, 'ticket.no_show', {
        ticketId: ticket.id,
        code: ticket.code,
      })
    }
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
        erId: true,
        code: true,
        queueId: true,
        queuePosition: true,
        pausedAt: true,
        representativeId: true,
        er: { select: { pauseTimeoutSeconds: true } },
      },
    })

    for (const ticket of candidates) {
      if (
        this._isPauseExpired(TicketState.PAUSED, ticket.pausedAt, ticket.er.pauseTimeoutSeconds)
      ) {
        await this._expirePause(ticket)
      }
    }
  }

  // Expirar a pausa NÃO cancela mais a senha: ela retoma e volta ao FIM da fila
  // (mesma regra da retomada manual), seja a pausa da RE ou da operação. O evento
  // `ticket_pause_expired` é mantido (dentro da retomada) para os indicadores, e
  // a retomada emite `ticket.created`. Se a senha já saiu de PAUSED (corrida), a
  // retomada devolve null e o ciclo simplesmente ignora.
  private async _expirePause(ticket: {
    id: string
    erId: string
    code: string
    queueId: string
    queuePosition: number
    pausedAt: Date | null
    representativeId: string
  }) {
    await this._resumeToEndOfQueue(ticket, { pauseExpired: true })
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
    const resumed = await this._resumeInPlace(ticket, {})
    if (!resumed) throw new BadRequestException('Não foi possível retomar a senha')
    return resumed
  }

  async staffResumeTicket(ticketId: string, user: AuthenticatedUser) {
    const ticket = await this._getTicket(ticketId)
    this._assertStaffER(ticket.erId, user)
    if (ticket.state !== TicketState.PAUSED) {
      throw new BadRequestException('Somente senhas pausadas podem ser retomadas')
    }
    await this._assertOperationOpen(ticket.erId)
    await this._assertOperatorActiveCounter(ticket.erId, user, null)
    const resumed = await this._resumeInPlace(ticket, { operatorId: user.userId })
    if (!resumed) throw new BadRequestException('Não foi possível retomar a senha')
    return resumed
  }

  // Marca/desmarca atendimento preferencial (Lei 10.048). Afeta só a ordem da fila
  // de espera: preferenciais são chamadas antes das normais (ORDER BY isPriority
  // DESC, queuePosition ASC). Permitido apenas enquanto a senha aguarda ou está
  // pausada; o queuePosition é preservado, então a posição relativa é recalculada.
  async setTicketPriority(ticketId: string, isPriority: boolean, user: AuthenticatedUser) {
    const ticket = await this._getTicket(ticketId)
    this._assertStaffER(ticket.erId, user)
    const settableStates: TicketState[] = [TicketState.WAITING, TicketState.PAUSED]
    if (!settableStates.includes(ticket.state)) {
      throw new BadRequestException(
        'Só é possível alterar a prioridade de senhas aguardando ou pausadas',
      )
    }
    // Alterar prioridade é uma mudança de estado real: rejeita o no-op (a senha já
    // está no valor pedido) em vez de reemitir evento e gravar auditoria à toa. Mesma
    // mensagem é reusada na corrida (CAS-miss) mais abaixo.
    const alreadyAtTargetMessage = isPriority
      ? 'A senha já é preferencial'
      : 'A senha já não é preferencial'
    if (ticket.isPriority === isPriority) {
      throw new BadRequestException(alreadyAtTargetMessage)
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // Compare-and-swap no estado E na prioridade: se a senha transicionou (ex.: foi
      // chamada) ou já teve a prioridade alterada entre a leitura e a escrita, não
      // mexemos às cegas — o where exige o valor oposto ao que está sendo aplicado.
      const result = await tx.ticket.updateMany({
        where: { id: ticketId, state: { in: settableStates }, isPriority: !isPriority },
        data: { isPriority },
      })
      if (result.count !== 1) {
        // Distingue a corrida de mesmo sentido (outra operadora já aplicou o valor) do
        // caso em que a senha saiu de WAITING/PAUSED — para dar a mensagem correta.
        const current = await tx.ticket.findUnique({
          where: { id: ticketId },
          select: { isPriority: true },
        })
        throw new BadRequestException(
          current?.isPriority === isPriority
            ? alreadyAtTargetMessage
            : 'Não foi possível alterar a prioridade da senha',
        )
      }
      await tx.auditEvent.create({
        data: {
          eventType: 'ticket_priority_changed',
          erId: ticket.erId,
          ticketId,
          representativeId: ticket.representativeId,
          operatorId: user.userId,
          metadata: { isPriority, byStaff: true, fromState: ticket.state },
        },
      })
      return tx.ticket.findUniqueOrThrow({
        where: { id: ticketId },
        include: REPRESENTATIVE_TICKET_INCLUDE,
      })
    })

    this.panelGateway.emitToER(ticket.erId, 'ticket.priority_changed', { ticketId, isPriority })
    return this._buildRepresentativeTicketView(updated)
  }

  // A operação (operadora/atendente) pausa a senha de um RE com o mesmo tempo e a
  // mesma experiência da pausa feita pela própria RE. Aceita senha aguardando, em
  // chamada ou em atendimento; nos dois últimos, LIBERA o caixa (volta a ACTIVE) e
  // desfaz os vínculos da senha com o caixa para a operadora seguir o fluxo. Ao
  // expirar, a senha volta ao fim da fila (não cancela), igual à pausa da RE.
  async staffPauseTicket(ticketId: string, user: AuthenticatedUser) {
    const ticket = await this._getTicket(ticketId)
    this._assertStaffER(ticket.erId, user)
    const pausableStates: TicketState[] = [
      TicketState.WAITING,
      TicketState.CALLING,
      TicketState.IN_SERVICE,
    ]
    if (!pausableStates.includes(ticket.state)) {
      throw new BadRequestException(
        'Somente senhas aguardando, em chamada ou em atendimento podem ser pausadas',
      )
    }
    await this._assertOperationOpen(ticket.erId)
    await this._assertOperatorActiveCounter(ticket.erId, user, ticket.counterId)
    const fromState = ticket.state
    const counterId = ticket.counterId

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.ticket.updateMany({
        // Compare-and-swap no estado atual: se a senha transicionou (ex.: chamada
        // virou atendimento) entre a leitura e a escrita, não pausamos às cegas.
        where: { id: ticketId, state: fromState },
        data: {
          state: TicketState.PAUSED,
          pausedAt: new Date(),
          counterId: null,
          operatorId: null,
          calledAt: null,
          serviceStartedAt: null,
        },
      })
      if (result.count !== 1) {
        throw new BadRequestException('Não foi possível pausar a senha')
      }

      // Senha em chamada/atendimento estava num caixa: libera o caixa (guardado por
      // estado para não sobrescrever um caixa que já seguiu adiante).
      if (counterId) {
        await tx.counter.updateMany({
          where: { id: counterId, state: { in: [CounterState.CALLING, CounterState.IN_SERVICE] } },
          data: { state: CounterState.ACTIVE },
        })
      }

      await tx.auditEvent.create({
        data: {
          eventType: 'ticket_paused',
          erId: ticket.erId,
          ticketId,
          representativeId: ticket.representativeId,
          operatorId: user.userId,
          metadata: { byStaff: true, fromState, ...(counterId ? { counterId } : {}) },
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

  // Núcleo da retomada: devolve a senha PAUSED ao FIM da fila do dia atual (novo
  // código/posição), acumula o tempo pausado e emite `ticket.created`. Usado pela
  // retomada da RE, pela retomada da operação e pela expiração da pausa. A posse
  // (representativeId) é checada pelo chamador, não aqui. Retorna null se a senha
  // já não estava PAUSED (corrida) — o chamador decide se isso é erro.
  private async _resumeToEndOfQueue(
    ticket: {
      id: string
      erId: string
      queueId: string
      queuePosition: number
      pausedAt: Date | null
      representativeId: string
    },
    opts: { operatorId?: string; pauseExpired?: boolean },
  ) {
    const businessDate = getBusinessDate()

    const outcome = await this.prisma.$transaction(async (tx) => {
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
        where: { id: ticket.id, state: TicketState.PAUSED },
        data: {
          state: TicketState.WAITING,
          queueId: queue.id,
          queuePosition: queue.nextSequence,
          code: this._generateCode(queue.nextSequence),
          pausedAt: null,
          pausedSeconds: { increment: additionalPausedSeconds },
        },
      })
      if (result.count !== 1) return null

      if (opts.pauseExpired) {
        await tx.auditEvent.create({
          data: {
            eventType: 'ticket_pause_expired',
            erId: ticket.erId,
            ticketId: ticket.id,
            representativeId: ticket.representativeId,
          },
        })
      }

      await tx.auditEvent.create({
        data: {
          eventType: 'ticket_resumed',
          erId: ticket.erId,
          ticketId: ticket.id,
          representativeId: ticket.representativeId,
          operatorId: opts.operatorId,
          metadata: {
            newPosition: queue.nextSequence,
            pausedSeconds: additionalPausedSeconds,
            ...(opts.operatorId ? { byStaff: true } : {}),
            ...(opts.pauseExpired ? { pauseExpired: true } : {}),
            ...(queue.id === ticket.queueId ? {} : { migratedFromQueueId: ticket.queueId }),
          },
        },
      })

      const fresh = await tx.ticket.findUniqueOrThrow({
        where: { id: ticket.id },
        include: { representative: { select: { fullName: true } } },
      })
      return { updated: fresh, queueId: queue.id }
    })

    if (!outcome) return null

    const currentPosition = await this._waitingPositionCount(this.prisma, {
      queueId: outcome.queueId,
      isPriority: outcome.updated.isPriority,
      queuePosition: outcome.updated.queuePosition,
    })

    this.panelGateway.emitToER(ticket.erId, 'ticket.created', {
      ticketId: ticket.id,
      code: outcome.updated.code,
      queuePosition: currentPosition,
    })
    return { ...outcome.updated, currentPosition }
  }

  // Retomada MANUAL (RE ou operação): a senha volta à MESMA posição e código que tinha
  // antes de pausar. O slot (queueId, queuePosition) fica reservado durante a pausa
  // (a linha PAUSED ainda o ocupa; senhas novas usam nextSequence maior), então não há
  // conflito com a unique(queueId, queuePosition). A ordenação `isPriority DESC,
  // queuePosition ASC` coloca a senha automaticamente ATRÁS de qualquer preferencial
  // que tenha entrado durante a pausa e à frente dos normais que chegaram depois. A
  // EXPIRAÇÃO do tempo de pausa usa `_resumeToEndOfQueue` (volta ao fim, penalidade).
  // Retorna null se a senha já não estava PAUSED (corrida).
  private async _resumeInPlace(
    ticket: { id: string; erId: string; pausedAt: Date | null; representativeId: string },
    opts: { operatorId?: string },
  ) {
    const outcome = await this.prisma.$transaction(async (tx) => {
      const now = new Date()
      const additionalPausedSeconds = ticket.pausedAt
        ? Math.round((now.getTime() - ticket.pausedAt.getTime()) / 1000)
        : 0

      const result = await tx.ticket.updateMany({
        where: { id: ticket.id, state: TicketState.PAUSED },
        data: {
          state: TicketState.WAITING,
          pausedAt: null,
          pausedSeconds: { increment: additionalPausedSeconds },
        },
      })
      if (result.count !== 1) return null

      await tx.auditEvent.create({
        data: {
          eventType: 'ticket_resumed',
          erId: ticket.erId,
          ticketId: ticket.id,
          representativeId: ticket.representativeId,
          operatorId: opts.operatorId,
          metadata: {
            inPlace: true,
            pausedSeconds: additionalPausedSeconds,
            ...(opts.operatorId ? { byStaff: true } : {}),
          },
        },
      })

      return tx.ticket.findUniqueOrThrow({
        where: { id: ticket.id },
        include: { representative: { select: { fullName: true } } },
      })
    })

    if (!outcome) return null

    const currentPosition = await this._waitingPositionCount(this.prisma, {
      queueId: outcome.queueId,
      isPriority: outcome.isPriority,
      queuePosition: outcome.queuePosition,
    })

    this.panelGateway.emitToER(ticket.erId, 'ticket.created', {
      ticketId: ticket.id,
      code: outcome.code,
      queuePosition: currentPosition,
    })
    return { ...outcome, currentPosition }
  }

  private async _markNoShow(ticketId: string, user: AuthenticatedUser) {
    const ticket = await this._getTicket(ticketId)
    this._assertAssignedOperator(ticket, user)
    const now = new Date()

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.ticket.updateMany({
        where: { id: ticketId, state: TicketState.CALLING, operatorId: user.userId },
        data: { state: TicketState.NO_SHOW, noShowAt: now },
      })
      if (result.count !== 1) {
        throw new BadRequestException(
          'A senha deve estar em chamada para registrar não comparecimento',
        )
      }

      await tx.counter.update({
        where: { id: ticket.counterId! },
        data: { state: CounterState.ACTIVE },
      })
      await tx.auditEvent.create({
        data: {
          eventType: 'ticket_marked_no_show',
          erId: ticket.erId,
          ticketId,
          operatorId: user.userId,
          metadata: { counterId: ticket.counterId },
        },
      })
      return tx.ticket.findUniqueOrThrow({ where: { id: ticketId } })
    })

    this.panelGateway.emitToER(ticket.erId, 'ticket.no_show', { ticketId, code: ticket.code })
    return updated
  }

  private async _transitionToInService(
    ticket: Awaited<ReturnType<TicketService['_getTicket']>>,
    opts: ServiceTransitionOptions,
  ) {
    if (!ticket.counterId) {
      throw new ConflictException({
        code: 'TICKET_NOT_CALLED',
        message: 'A senha ainda não foi chamada',
      })
    }
    const counterId = ticket.counterId
    const now = new Date()
    const where: Prisma.TicketWhereInput = { id: ticket.id, state: TicketState.CALLING }
    if (opts.restrictToOperatorId) where.operatorId = opts.restrictToOperatorId

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.ticket.updateMany({
        where,
        data: { state: TicketState.IN_SERVICE, serviceStartedAt: now },
      })
      if (result.count !== 1) {
        throw new BadRequestException('A senha deve estar em chamada para iniciar o atendimento')
      }

      await tx.counter.update({
        where: { id: counterId },
        data: { state: CounterState.IN_SERVICE },
      })
      await tx.auditEvent.create({
        data: {
          eventType: 'service_started',
          erId: ticket.erId,
          ticketId: ticket.id,
          operatorId: ticket.operatorId,
          metadata: this._serviceAuditMetadata(counterId, opts),
        },
      })
      return tx.ticket.findUniqueOrThrow({
        where: { id: ticket.id },
        include: { counter: { select: { number: true } } },
      })
    })

    this.panelGateway.emitToER(ticket.erId, 'ticket.service_started', {
      ticketId: ticket.id,
      code: ticket.code,
      counterNumber: updated.counter?.number ?? 0,
    })
    return updated
  }

  private async _transitionToFinished(
    ticket: Awaited<ReturnType<TicketService['_getTicket']>>,
    opts: ServiceTransitionOptions,
  ) {
    if (!ticket.counterId) {
      throw new ConflictException({
        code: 'TICKET_NOT_IN_SERVICE',
        message: 'A senha não está em atendimento',
      })
    }
    const counterId = ticket.counterId
    const now = new Date()
    const where: Prisma.TicketWhereInput = { id: ticket.id, state: TicketState.IN_SERVICE }
    if (opts.restrictToOperatorId) where.operatorId = opts.restrictToOperatorId

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.ticket.updateMany({
        where,
        data: { state: TicketState.FINISHED, serviceFinishedAt: now },
      })
      if (result.count !== 1) {
        throw new BadRequestException('A senha deve estar em atendimento para ser finalizada')
      }

      await tx.counter.update({
        where: { id: counterId },
        data: { state: CounterState.ACTIVE },
      })
      await tx.auditEvent.create({
        data: {
          eventType: 'service_finished',
          erId: ticket.erId,
          ticketId: ticket.id,
          operatorId: ticket.operatorId,
          metadata: this._serviceAuditMetadata(counterId, opts),
        },
      })
      return tx.ticket.findUniqueOrThrow({ where: { id: ticket.id } })
    })

    this.panelGateway.emitToER(ticket.erId, 'ticket.service_finished', {
      ticketId: ticket.id,
      code: ticket.code,
    })
    return updated
  }

  private _serviceAuditMetadata(
    counterId: string,
    opts: ServiceTransitionOptions,
  ): Prisma.InputJsonObject {
    const metadata: Record<string, Prisma.InputJsonValue> = { counterId }
    if (opts.source === 'integration') {
      metadata.source = 'integration'
      if (opts.client) metadata.client = opts.client
      if (opts.scopes?.length) metadata.scopes = opts.scopes
      if (opts.idempotencyKey) metadata.idempotencyKey = opts.idempotencyKey
    }
    return metadata
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

  private async _assertOperationOpen(erId: string) {
    const er = await this.prisma.eR.findUnique({ where: { id: erId }, select: { isDayOpen: true } })
    if (!er?.isDayOpen) {
      throw new BadRequestException('A operação do dia está encerrada')
    }
  }

  // Uma OPERADORA só gerencia a fila a partir do seu caixa aberto e não-pausado.
  // Com o caixa pausado (em pausa) ou sem caixa, ela não pausa/retoma senhas. E
  // não pode pausar uma senha que está em OUTRO caixa (atendimento de outra
  // operadora) — isso fica restrito à gestora. Atendente/gestora/admin não operam
  // caixa, então não passam por esta checagem (a gestora pode pausar cross-caixa).
  private async _assertOperatorActiveCounter(
    erId: string,
    user: AuthenticatedUser,
    ticketCounterId: string | null,
  ) {
    if (user.role !== Role.OPERATOR) return
    const counter = await this.prisma.counter.findFirst({
      where: {
        erId,
        operatorId: user.userId,
        state: { in: [CounterState.ACTIVE, CounterState.CALLING, CounterState.IN_SERVICE] },
      },
      select: { id: true },
    })
    if (!counter) {
      throw new BadRequestException('Abra ou retome seu caixa para gerenciar senhas.')
    }
    if (ticketCounterId && ticketCounterId !== counter.id) {
      throw new ForbiddenException('Não é possível pausar uma senha que está em outro caixa.')
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
