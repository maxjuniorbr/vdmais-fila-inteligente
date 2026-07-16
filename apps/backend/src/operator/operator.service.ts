import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Role } from '@prisma/client'
import { AuthenticatedUser } from '../common/authenticated-user'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class OperatorService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(user: AuthenticatedUser) {
    if (user.role === Role.REPRESENTATIVE) {
      throw new ForbiddenException('É necessário um perfil de equipe')
    }

    const operator = await this.prisma.operator.findUnique({
      where: { id: user.userId },
      select: { id: true, name: true, email: true, role: true, erId: true },
    })
    if (!operator) throw new NotFoundException('Conta da equipe não encontrada')
    return operator
  }
}
