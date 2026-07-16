import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { RepresentativeKind, TicketState } from '@prisma/client'
import { getBusinessDate } from '../common/business-date'
import { normalizeReCode, onlyDigits } from '../common/representative-identifiers'
import { PrismaService } from '../prisma/prisma.service'
import {
  IntegrationActionContext,
  IntegrationActionResult,
  TicketService,
} from '../ticket/ticket.service'
import { IntegrationPrincipal } from './auth/integration-jwt.strategy'
import { IntegrationActionDto } from './dto/integration-action.dto'

const AT_COUNTER_STATES = [TicketState.CALLING, TicketState.IN_SERVICE]

export interface IntegrationActionResponse {
  ticketId: string
  code: string
  erId: string
  state: string
  serviceStartedAt: Date | null
  serviceFinishedAt: Date | null
  idempotent: boolean
}

@Injectable()
export class IntegrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ticketService: TicketService,
  ) {}

  async startService(
    dto: IntegrationActionDto,
    principal: IntegrationPrincipal,
  ): Promise<IntegrationActionResponse> {
    const ticketId = await this._resolveTicketId(dto, 'start')
    const result = await this.ticketService.advanceToInService(ticketId, this._ctx(dto, principal))
    return this._present(result)
  }

  async finishService(
    dto: IntegrationActionDto,
    principal: IntegrationPrincipal,
  ): Promise<IntegrationActionResponse> {
    const ticketId = await this._resolveTicketId(dto, 'finish')
    const result = await this.ticketService.completeService(ticketId, this._ctx(dto, principal))
    return this._present(result)
  }

  private _ctx(
    dto: IntegrationActionDto,
    principal: IntegrationPrincipal,
  ): IntegrationActionContext {
    return {
      client: principal.client,
      scopes: principal.scopes,
      idempotencyKey: dto.idempotencyKey,
    }
  }

  // Resolve pela senha onde a RE foi chamada (CALLING/IN_SERVICE): ela está num
  // caixa de um único ER. `finish` também aceita a FINISHED do dia (idempotência).
  private async _resolveTicketId(
    dto: IntegrationActionDto,
    action: 'start' | 'finish',
  ): Promise<string> {
    const representativeId = await this._resolveRepresentativeId(dto)
    const erFilter = dto.erId ? { erId: dto.erId } : {}

    const atCounter = await this.prisma.ticket.findMany({
      where: { representativeId, state: { in: AT_COUNTER_STATES }, ...erFilter },
      select: { id: true, erId: true },
    })
    if (atCounter.length > 0) {
      return this._singleTicketId(atCounter, { strict: true })
    }

    if (action === 'finish') {
      const finishedToday = await this.prisma.ticket.findMany({
        where: {
          representativeId,
          state: TicketState.FINISHED,
          queue: { businessDate: getBusinessDate() },
          ...erFilter,
        },
        orderBy: { serviceFinishedAt: 'desc' },
        select: { id: true, erId: true },
      })
      if (finishedToday.length > 0) {
        // Lenient: a RE may have several FINISHED tickets today (multiple queue
        // entries); the list is ordered by serviceFinishedAt desc, so take the
        // most recent for idempotency.
        return this._singleTicketId(finishedToday, { strict: false })
      }
    }

    throw new NotFoundException({
      code: 'NO_ACTIVE_TICKET',
      message: 'Nenhuma senha em chamada ou atendimento para este(a) revendedor(a)',
    })
  }

  private async _resolveRepresentativeId(dto: IntegrationActionDto): Promise<string> {
    const reCode = dto.reCode?.trim()
    const cpf = dto.cpf?.trim()
    let where: { reCode: string } | { cpf: string }
    if (reCode && !cpf) {
      where = { reCode: normalizeReCode(reCode) }
    } else if (cpf && !reCode) {
      where = { cpf: onlyDigits(cpf) }
    } else {
      throw new BadRequestException({
        code: 'INVALID_IDENTIFIER',
        message: 'Informe exatamente um entre reCode e cpf',
      })
    }

    const representative = await this.prisma.representative.findUnique({
      where,
      select: { id: true, kind: true },
    })
    if (representative?.kind !== RepresentativeKind.REGISTERED) {
      throw new NotFoundException({
        code: 'REPRESENTATIVE_NOT_FOUND',
        message: 'Revendedor(a) não encontrado(a)',
      })
    }
    return representative.id
  }

  private _singleTicketId(
    tickets: Array<{ id: string; erId: string }>,
    { strict }: { strict: boolean },
  ): string {
    const distinctErs = new Set(tickets.map((ticket) => ticket.erId))
    if (distinctErs.size > 1) {
      throw new ConflictException({
        code: 'MULTIPLE_ACTIVE_TICKETS',
        message: 'Revendedor(a) em atendimento em mais de um ER; informe erId para desambiguar',
      })
    }
    // For the at-counter path, more than one active ticket in a single ER is an
    // anomaly (a RE has at most one). Fail deterministically instead of silently
    // acting on an arbitrary ticket.
    if (strict && tickets.length > 1) {
      throw new ConflictException({
        code: 'MULTIPLE_ACTIVE_TICKETS',
        message: 'Mais de uma senha ativa para este(a) revendedor(a); ação ambígua',
      })
    }
    return tickets[0].id
  }

  private _present(result: IntegrationActionResult): IntegrationActionResponse {
    const { ticket } = result
    return {
      ticketId: ticket.id,
      code: ticket.code,
      erId: ticket.erId,
      state: ticket.state,
      serviceStartedAt: ticket.serviceStartedAt,
      serviceFinishedAt: ticket.serviceFinishedAt,
      idempotent: result.idempotent,
    }
  }
}
