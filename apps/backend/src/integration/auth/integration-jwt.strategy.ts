import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { passportJwtSecret } from 'jwks-rsa'
import type { Algorithm } from 'jsonwebtoken'
import { normalizePem } from './pem.util'

// Nome próprio, distinto da strategy de staff (default 'jwt'): impede que um
// token de operador autentique numa rota de integração e vice-versa.
export const INTEGRATION_JWT_STRATEGY = 'integration-jwt'

export interface IntegrationPrincipal {
  type: 'integration'
  client?: string
  scopes: string[]
}

interface IntegrationJwtPayload {
  scope?: string
  scp?: string[]
  client_id?: string
  azp?: string
  sub?: string
}

function extractScopes(payload: IntegrationJwtPayload): string[] {
  if (typeof payload.scope === 'string') return payload.scope.split(' ').filter(Boolean)
  if (Array.isArray(payload.scp)) return payload.scp
  return []
}

@Injectable()
export class IntegrationJwtStrategy extends PassportStrategy(Strategy, INTEGRATION_JWT_STRATEGY) {
  constructor(config: ConfigService) {
    const jwksUri = config.get<string>('INTEGRATION_JWKS_URI')?.trim()
    const nodeEnv = (config.get<string>('NODE_ENV') ?? '').toLowerCase()
    const relaxedEnv = nodeEnv === 'development' || nodeEnv === 'test'
    const devPublicKey = relaxedEnv
      ? normalizePem(config.get<string>('INTEGRATION_DEV_PUBLIC_KEY'))
      : undefined

    const common = {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      algorithms: ['RS256'] as Algorithm[],
      issuer: config.get<string>('INTEGRATION_JWT_ISSUER')?.trim() || undefined,
      audience: config.get<string>('INTEGRATION_JWT_AUDIENCE')?.trim() || undefined,
      passReqToCallback: false as const,
    }

    if (jwksUri) {
      super({
        ...common,
        secretOrKeyProvider: passportJwtSecret({
          jwksUri,
          cache: true,
          rateLimit: true,
          jwksRequestsPerMinute: 10,
        }),
      })
    } else if (devPublicKey) {
      super({ ...common, secretOrKey: devPublicKey })
    } else {
      super({
        ...common,
        secretOrKeyProvider: (_req, _raw, done) =>
          done(new Error('Integration auth not configured'), undefined),
      })
    }
  }

  validate(payload: IntegrationJwtPayload): IntegrationPrincipal {
    return {
      type: 'integration',
      client: payload.client_id ?? payload.azp ?? payload.sub,
      scopes: extractScopes(payload),
    }
  }
}
