import { Controller, Param, Post, Request, UseGuards } from '@nestjs/common'
import { AuthenticatedUser } from '../common/authenticated-user'
import { Roles } from '../common/decorators/roles.decorator'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { TelemetryService } from './telemetry.service'

@Controller('telemetry')
export class TelemetryController {
  constructor(private readonly telemetryService: TelemetryService) {}

  @Post('tickets/:ticketId/displayed')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('REPRESENTATIVE')
  ticketDisplayed(
    @Param('ticketId') ticketId: string,
    @Request() req: { user: AuthenticatedUser },
  ) {
    return this.telemetryService.recordTicketDisplayed(ticketId, req.user)
  }

  @Post('staff/logout')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OPERATOR', 'ATTENDANT', 'MANAGER')
  logout(@Request() req: { user: AuthenticatedUser }) {
    return this.telemetryService.recordLogout(req.user)
  }

  @Post('manual-checkin/start')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ATTENDANT')
  manualCheckinStarted(@Request() req: { user: AuthenticatedUser }) {
    return this.telemetryService.recordManualCheckinStarted(req.user)
  }
}
