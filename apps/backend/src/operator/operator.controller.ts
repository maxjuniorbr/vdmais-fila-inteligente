import { Controller, Get, Request, UseGuards } from '@nestjs/common'
import { AuthenticatedUser } from '../common/authenticated-user'
import { Roles } from '../common/decorators/roles.decorator'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { OperatorService } from './operator.service'

@Controller('operators')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OperatorController {
  constructor(private readonly operatorService: OperatorService) {}

  @Get('me')
  @Roles('OPERATOR', 'ATTENDANT', 'MANAGER')
  getProfile(@Request() req: { user: AuthenticatedUser }) {
    return this.operatorService.getProfile(req.user)
  }
}
