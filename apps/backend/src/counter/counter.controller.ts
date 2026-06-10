import { Controller, Param, Post, Body, UseGuards, Request, Get } from '@nestjs/common'
import { CounterService } from './counter.service'
import { PauseCounterDto } from './dto/pause-counter.dto'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { AuthenticatedUser } from '../common/authenticated-user'

@Controller('counters')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CounterController {
  constructor(private readonly counterService: CounterService) {}

  @Get()
  @Roles('OPERATOR', 'MANAGER', 'ATTENDANT')
  list(@Request() req: { user: AuthenticatedUser }) {
    return this.counterService.listForER(req.user)
  }

  @Post(':id/open')
  @Roles('OPERATOR')
  open(@Param('id') id: string, @Request() req: { user: AuthenticatedUser }) {
    return this.counterService.openCounter(id, req.user)
  }

  @Post(':id/pause')
  @Roles('OPERATOR')
  pause(
    @Param('id') id: string,
    @Body() dto: PauseCounterDto,
    @Request() req: { user: AuthenticatedUser },
  ) {
    return this.counterService.pauseCounter(id, req.user, dto.reason)
  }

  @Post(':id/resume')
  @Roles('OPERATOR')
  resume(@Param('id') id: string, @Request() req: { user: AuthenticatedUser }) {
    return this.counterService.resumeCounter(id, req.user)
  }

  @Post(':id/close')
  @Roles('OPERATOR')
  close(@Param('id') id: string, @Request() req: { user: AuthenticatedUser }) {
    return this.counterService.closeCounter(id, req.user)
  }
}
