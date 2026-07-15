import { Controller, Post, Get, Query, Body, Param, UseGuards, Request } from '@nestjs/common'
import { TicketService } from './ticket.service'
import { CreateTicketDto } from './dto/create-ticket.dto'
import { CancelTicketDto, CorrectTicketDto, RestoreTicketDto } from './dto/ticket-action.dto'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { AuthenticatedUser } from '../common/authenticated-user'
import { Throttle } from '@nestjs/throttler'
import { throttleLimit } from '../common/throttle-limits'

@Controller('tickets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TicketController {
  constructor(private readonly ticketService: TicketService) {}

  @Post()
  @Roles('REPRESENTATIVE', 'ATTENDANT')
  @Throttle({ default: { ttl: 60000, limit: throttleLimit('THROTTLE_TICKET_CREATE_PER_MINUTE', 40) } })
  create(@Body() dto: CreateTicketDto, @Request() req: { user: AuthenticatedUser }) {
    return this.ticketService.create(req.user, dto)
  }

  @Get('my-active')
  @Roles('REPRESENTATIVE')
  getMyActive(@Query('erId') erId: string, @Request() req: { user: AuthenticatedUser }) {
    return this.ticketService.getMyActiveTicket(req.user.userId, erId)
  }

  @Get('my-status')
  @Roles('REPRESENTATIVE')
  getMyStatus(@Query('erId') erId: string, @Request() req: { user: AuthenticatedUser }) {
    return this.ticketService.getMyTicketStatus(req.user.userId, erId)
  }

  @Post(':id/cancel')
  @Roles('ATTENDANT', 'MANAGER')
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelTicketDto,
    @Request() req: { user: AuthenticatedUser },
  ) {
    return this.ticketService.cancel(id, dto.reason, req.user)
  }

  @Post(':id/restore')
  @Roles('MANAGER')
  restore(
    @Param('id') id: string,
    @Body() dto: RestoreTicketDto,
    @Request() req: { user: AuthenticatedUser },
  ) {
    return this.ticketService.restore(id, dto.reason, req.user)
  }

  @Post(':id/recall')
  @Roles('OPERATOR')
  recall(@Param('id') id: string, @Request() req: { user: AuthenticatedUser }) {
    return this.ticketService.recall(id, req.user)
  }

  @Post(':id/correct')
  @Roles('MANAGER')
  correct(
    @Param('id') id: string,
    @Body() dto: CorrectTicketDto,
    @Request() req: { user: AuthenticatedUser },
  ) {
    return this.ticketService.correct(id, dto, req.user)
  }

  @Post(':id/start-service')
  @Roles('OPERATOR')
  startService(@Param('id') id: string, @Request() req: { user: AuthenticatedUser }) {
    return this.ticketService.startService(id, req.user)
  }

  @Post(':id/finish-service')
  @Roles('OPERATOR')
  finishService(@Param('id') id: string, @Request() req: { user: AuthenticatedUser }) {
    return this.ticketService.finishService(id, req.user)
  }

  @Post(':id/no-show')
  @Roles('OPERATOR')
  noShow(@Param('id') id: string, @Request() req: { user: AuthenticatedUser }) {
    return this.ticketService.noShow(id, req.user)
  }

  @Post(':id/pause')
  @Roles('REPRESENTATIVE')
  pause(@Param('id') id: string, @Request() req: { user: AuthenticatedUser }) {
    return this.ticketService.pauseTicket(id, req.user.userId)
  }

  @Post(':id/resume')
  @Roles('REPRESENTATIVE')
  resume(@Param('id') id: string, @Request() req: { user: AuthenticatedUser }) {
    return this.ticketService.resumeTicket(id, req.user.userId)
  }

  @Post(':id/staff-pause')
  @Roles('OPERATOR', 'ATTENDANT', 'MANAGER', 'ADMIN')
  staffPause(@Param('id') id: string, @Request() req: { user: AuthenticatedUser }) {
    return this.ticketService.staffPauseTicket(id, req.user)
  }

  @Post(':id/staff-resume')
  @Roles('OPERATOR', 'ATTENDANT', 'MANAGER', 'ADMIN')
  staffResume(@Param('id') id: string, @Request() req: { user: AuthenticatedUser }) {
    return this.ticketService.staffResumeTicket(id, req.user)
  }

  @Post(':id/self-cancel')
  @Roles('REPRESENTATIVE')
  selfCancel(@Param('id') id: string, @Request() req: { user: AuthenticatedUser }) {
    return this.ticketService.selfCancel(id, req.user.userId)
  }

  @Post(':id/mark-priority')
  @Roles('OPERATOR', 'ATTENDANT', 'MANAGER')
  markPriority(@Param('id') id: string, @Request() req: { user: AuthenticatedUser }) {
    return this.ticketService.setTicketPriority(id, true, req.user)
  }

  @Post(':id/unmark-priority')
  @Roles('OPERATOR', 'ATTENDANT', 'MANAGER')
  unmarkPriority(@Param('id') id: string, @Request() req: { user: AuthenticatedUser }) {
    return this.ticketService.setTicketPriority(id, false, req.user)
  }
}
