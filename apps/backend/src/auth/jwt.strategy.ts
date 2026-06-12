import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { ConfigService } from '@nestjs/config'
import { Role } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { getJwtSecret } from './jwt.config'

export interface JwtPayload {
  sub: string
  userId?: string
  role: Role
  erId?: string
  sv?: number
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: getJwtSecret(config),
    })
  }

  async validate(payload: JwtPayload) {
    const user = { userId: payload.userId ?? payload.sub, role: payload.role, erId: payload.erId }

    // Staff tokens carry a session version. Incrementing it on the account
    // (logout, password change, disable) revokes every token signed earlier.
    // Representative traffic is high-volume and low-risk, so it stays stateless.
    if (payload.role !== Role.REPRESENTATIVE) {
      const operator = await this.prisma.operator.findUnique({
        where: { id: user.userId },
        select: { sessionVersion: true },
      })
      if (!operator || operator.sessionVersion !== (payload.sv ?? 0)) {
        throw new UnauthorizedException('Sessão expirada. Entre novamente.')
      }
    }

    return user
  }
}
