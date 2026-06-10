import { Injectable } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { ConfigService } from '@nestjs/config'
import { Role } from '@prisma/client'
import { getJwtSecret } from './jwt.config'

export interface JwtPayload {
  sub: string
  userId?: string
  role: Role
  erId?: string
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: getJwtSecret(config),
    })
  }

  validate(payload: JwtPayload) {
    return { userId: payload.userId ?? payload.sub, role: payload.role, erId: payload.erId }
  }
}
