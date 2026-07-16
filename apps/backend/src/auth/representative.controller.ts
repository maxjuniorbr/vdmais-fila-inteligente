import { Body, Controller, Get, Post, Query, Request, UseGuards } from '@nestjs/common'
import { RepresentativeKind } from '@prisma/client'
import { AuthenticatedUser } from '../common/authenticated-user'
import { Roles } from '../common/decorators/roles.decorator'
import { PrismaService } from '../prisma/prisma.service'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { maskCpf, maskPhone } from '../common/pii-mask'
import { normalizeReCode, onlyDigits } from '../common/representative-identifiers'
import { AuthService } from './auth.service'
import { RegisterDto } from './dto/register.dto'

@Controller('representatives')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RepresentativeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  @Post()
  @Roles('ATTENDANT', 'MANAGER')
  async create(@Body() dto: RegisterDto, @Request() req: { user: AuthenticatedUser }) {
    const representative = await this.authService.createRepresentative(dto, {
      erId: req.user.erId,
      actor: req.user,
    })
    return {
      ...representative,
      cpf: maskCpf(representative.cpf),
      phone: maskPhone(representative.phone),
    }
  }

  @Get('search')
  @Roles('ATTENDANT', 'MANAGER')
  async search(@Query('q') q: string, @Request() req: { user: AuthenticatedUser }) {
    const erId = req.user.erId
    if (!erId) return []
    if (!q || q.trim().length < 3) return []

    const term = q.trim()
    const digits = onlyDigits(term)

    const representatives = await this.prisma.representative.findMany({
      where: {
        AND: [
          { OR: [{ cpf: digits }, { phone: digits }, { reCode: normalizeReCode(term) }] },
          { kind: RepresentativeKind.REGISTERED },
          { tickets: { some: { erId } } },
        ],
      },
      select: { id: true, fullName: true, cpf: true, phone: true, reCode: true },
      take: 10,
    })

    return representatives.map((representative) => ({
      id: representative.id,
      fullName: representative.fullName,
      cpf: maskCpf(representative.cpf),
      phone: maskPhone(representative.phone),
      reCode: representative.reCode,
    }))
  }
}
