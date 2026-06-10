import { Controller, Post, Get, Param, Body, UseGuards, Request } from '@nestjs/common'
import { QueueService } from './queue.service'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { IsString, IsNotEmpty, MaxLength } from 'class-validator'
import { AuthenticatedUser } from '../common/authenticated-user'

class CallNextDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  counterId!: string
}

@Controller('queues')
@UseGuards(JwtAuthGuard, RolesGuard)
export class QueueController {
  constructor(private readonly queueService: QueueService) {}

  @Post(':erId/call-next')
  @Roles('OPERATOR')
  callNext(
    @Param('erId') erId: string,
    @Body() dto: CallNextDto,
    @Request() req: { user: AuthenticatedUser },
  ) {
    return this.queueService.callNext(erId, dto.counterId, req.user)
  }

  @Get(':erId/overview')
  @Roles('OPERATOR', 'MANAGER', 'ATTENDANT')
  getOverview(@Param('erId') erId: string, @Request() req: { user: AuthenticatedUser }) {
    return this.queueService.getQueueOverview(erId, req.user)
  }
}
