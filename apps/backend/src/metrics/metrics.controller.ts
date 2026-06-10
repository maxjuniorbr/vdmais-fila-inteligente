import { Controller, Get, Param, Request, UseGuards } from '@nestjs/common'
import { MetricsService } from './metrics.service'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { AuthenticatedUser } from '../common/authenticated-user'

@Controller('metrics')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get(':erId/daily')
  @Roles('MANAGER')
  getDaily(@Param('erId') erId: string, @Request() req: { user: AuthenticatedUser }) {
    return this.metricsService.getDailyMetrics(erId, req.user)
  }
}
