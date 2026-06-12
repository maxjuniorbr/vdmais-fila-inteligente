import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Role } from '@prisma/client'
import { AuditLogService } from '../audit-log/audit-log.service'
import { AuthenticatedUser } from '../common/authenticated-user'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class TelemetryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async recordQueueEntryStarted(erId: string) {
    const er = await this.prisma.eR.findUnique({ where: { id: erId }, select: { id: true } })
    if (!er) throw new NotFoundException('ER não encontrado')
    await this.auditLog.log({ eventType: 'queue_entry_started', erId })
    return { recorded: true }
  }

  async recordTicketDisplayed(ticketId: string, user: AuthenticatedUser) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true, erId: true, representativeId: true },
    })
    if (!ticket) throw new NotFoundException('Senha não encontrada')
    if (user.role !== Role.REPRESENTATIVE || ticket.representativeId !== user.userId) {
      throw new ForbiddenException('Não é possível registrar a senha de outra representante')
    }

    await this.auditLog.log({
      eventType: 'ticket_displayed_to_re',
      erId: ticket.erId,
      ticketId,
      representativeId: user.userId,
    })
    return { recorded: true }
  }

  async recordPanelCallDisplayed(erId: string, ticketId: string) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId, erId },
      select: { id: true },
    })
    if (!ticket) throw new NotFoundException('Senha não encontrada neste ER')

    await this.auditLog.log({
      eventType: 'ticket_call_displayed_on_panel',
      erId,
      ticketId,
    })
    return { recorded: true }
  }

  async recordLogout(user: AuthenticatedUser) {
    if (user.role === Role.REPRESENTATIVE) {
      throw new ForbiddenException('Somente a saída da equipe é registrada aqui')
    }

    // Revoke every active token of this staff account by bumping the session
    // version. The current bearer token stops being accepted on the next
    // request. Applies to ADMIN too, which has no ER bound.
    await this.prisma.operator.update({
      where: { id: user.userId },
      data: { sessionVersion: { increment: 1 } },
    })

    if (user.erId) {
      await this.auditLog.log({
        eventType: 'operator_logged_out',
        erId: user.erId,
        operatorId: user.userId,
        metadata: { role: user.role },
      })
    }
    return { recorded: true }
  }

  async recordManualCheckinStarted(user: AuthenticatedUser) {
    if (user.role !== Role.ATTENDANT || !user.erId) {
      throw new ForbiddenException('Somente atendentes podem iniciar o check-in assistido')
    }
    await this.auditLog.log({
      eventType: 'manual_checkin_started',
      erId: user.erId,
      operatorId: user.userId,
    })
    return { recorded: true }
  }
}
