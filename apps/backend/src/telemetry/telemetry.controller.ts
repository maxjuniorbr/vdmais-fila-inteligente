import { Controller, Param, Post, Request, UseGuards } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { AuthenticatedUser } from '../common/authenticated-user'
import { Roles } from '../common/decorators/roles.decorator'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { TelemetryService } from './telemetry.service'

@Controller('telemetry')
export class TelemetryController {
  constructor(private readonly telemetryService: TelemetryService) {}

  @Post('queue-entry/:erId')
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  queueEntry(@Param('erId') erId: string) {
    return this.telemetryService.recordQueueEntryStarted(erId)
  }

  @Post('panel/:erId/tickets/:ticketId/displayed')
  @Throttle({ default: { ttl: 60000, limit: 120 } })
  panelDisplayed(@Param('erId') erId: string, @Param('ticketId') ticketId: string) {
    return this.telemetryService.recordPanelCallDisplayed(erId, ticketId)
  }

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
