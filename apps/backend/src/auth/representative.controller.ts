import { Body, Controller, Get, Post, Query, Request, UseGuards } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { AuthService } from './auth.service'
import { RegisterDto } from './dto/register.dto'
import { AuthenticatedUser } from '../common/authenticated-user'

@Controller('representatives')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RepresentativeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  @Post()
  @Roles('ATTENDANT', 'MANAGER')
  create(@Body() dto: RegisterDto, @Request() req: { user: AuthenticatedUser }) {
    return this.authService.createRepresentative(dto, {
      erId: req.user.erId,
      actor: req.user,
    })
  }

  @Get('search')
  @Roles('ATTENDANT', 'MANAGER')
  async search(@Query('q') q: string) {
    if (!q || q.trim().length < 3) return []

    const term = q.trim()
    const digits = term.replace(/\D/g, '')

    const representatives = await this.prisma.representative.findMany({
      where: {
        OR: [{ cpf: digits }, { phone: digits }, { reCode: term.toUpperCase() }],
      },
      select: { id: true, fullName: true, cpf: true, phone: true, reCode: true },
      take: 10,
    })

    return representatives.map((representative) => ({
      id: representative.id,
      fullName: representative.fullName,
      cpf: `***.***.${representative.cpf.slice(-3)}-**`,
      phone: `(**) *****-${representative.phone.slice(-4)}`,
      reCode: representative.reCode,
    }))
  }
}
