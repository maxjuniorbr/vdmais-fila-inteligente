import { Body, Controller, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common'
import { AdminService } from './admin.service'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { AuthenticatedUser } from '../common/authenticated-user'
import { CreateERDto } from './dto/create-er.dto'
import { UpdateERDto } from './dto/update-er.dto'
import { CreateCounterDto } from './dto/create-counter.dto'
import { CreateStaffDto } from './dto/create-staff.dto'

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('ers')
  listERs() {
    return this.adminService.listERs()
  }

  @Post('ers')
  createER(@Body() dto: CreateERDto, @Request() req: { user: AuthenticatedUser }) {
    return this.adminService.createER(dto, req.user)
  }

  @Get('ers/:erId')
  getER(@Param('erId') erId: string) {
    return this.adminService.getER(erId)
  }

  @Patch('ers/:erId')
  updateER(
    @Param('erId') erId: string,
    @Body() dto: UpdateERDto,
    @Request() req: { user: AuthenticatedUser },
  ) {
    return this.adminService.updateER(erId, dto, req.user)
  }

  @Post('ers/:erId/counters')
  createCounter(
    @Param('erId') erId: string,
    @Body() dto: CreateCounterDto,
    @Request() req: { user: AuthenticatedUser },
  ) {
    return this.adminService.createCounter(erId, dto, req.user)
  }

  @Post('ers/:erId/staff')
  createStaff(
    @Param('erId') erId: string,
    @Body() dto: CreateStaffDto,
    @Request() req: { user: AuthenticatedUser },
  ) {
    return this.adminService.createStaff(erId, dto, req.user)
  }
}
