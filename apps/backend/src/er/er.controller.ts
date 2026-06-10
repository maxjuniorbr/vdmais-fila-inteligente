import { Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common'
import { ERService } from './er.service'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { AuthenticatedUser } from '../common/authenticated-user'

@Controller('ers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ERController {
  constructor(private readonly erService: ERService) {}

  @Get(':id')
  @Roles('MANAGER')
  get(@Param('id') id: string, @Request() req: { user: AuthenticatedUser }) {
    return this.erService.getForStaff(id, req.user)
  }

  @Post(':id/open-day')
  @Roles('MANAGER')
  openDay(@Param('id') id: string, @Request() req: { user: AuthenticatedUser }) {
    return this.erService.openDay(id, req.user)
  }

  @Post(':id/close-day')
  @Roles('MANAGER')
  closeDay(@Param('id') id: string, @Request() req: { user: AuthenticatedUser }) {
    return this.erService.closeDay(id, req.user)
  }
}
