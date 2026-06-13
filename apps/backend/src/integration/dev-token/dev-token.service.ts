import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createPublicKey } from 'node:crypto'
import * as jwt from 'jsonwebtoken'
import { timingSafeStringEqual } from '../../common/timing-safe-equal'
import { normalizePem } from '../auth/pem.util'
import {
  INTEGRATION_DEV_KID,
  INTEGRATION_DEV_TOKEN_TTL_SECONDS,
} from '../integration.constants'

export interface DevTokenResponse {
  access_token: string
  token_type: 'Bearer'
  expires_in: number
  scope: string
}

interface DevTokenRequest {
  grant_type: string
  client_id: string
  client_secret: string
  scope?: string
}

@Injectable()
export class DevTokenService {
  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    const nodeEnv = (this.config.get<string>('NODE_ENV') ?? '').toLowerCase()
    const relaxed = nodeEnv === 'development' || nodeEnv === 'test'
    const flag =
      (this.config.get<string>('INTEGRATION_DEV_TOKEN_ENABLED') ?? '').toLowerCase() === 'true'
    return relaxed && flag
  }

  publicJwk(): Record<string, unknown> | null {
    const publicKey = normalizePem(this.config.get<string>('INTEGRATION_DEV_PUBLIC_KEY'))
    if (!publicKey) return null
    const jwk = createPublicKey(publicKey).export({ format: 'jwk' })
    return { ...jwk, kid: INTEGRATION_DEV_KID, use: 'sig', alg: 'RS256' }
  }

  issue(body: DevTokenRequest): DevTokenResponse {
    if (!this.isEnabled()) {
      throw new NotFoundException()
    }
    if (body.grant_type !== 'client_credentials') {
      throw new BadRequestException({ error: 'unsupported_grant_type' })
    }

    const clientId = this.config.get<string>('INTEGRATION_DEV_CLIENT_ID')?.trim()
    const clientSecret = this.config.get<string>('INTEGRATION_DEV_CLIENT_SECRET')?.trim()
    const clientOk = !!clientId && body.client_id === clientId
    const secretOk = !!clientSecret && timingSafeStringEqual(body.client_secret, clientSecret)
    if (!clientOk || !secretOk) {
      throw new UnauthorizedException({ error: 'invalid_client' })
    }

    const allowed = (this.config.get<string>('INTEGRATION_DEV_ALLOWED_SCOPES') ?? '')
      .split(' ')
      .filter(Boolean)
    const requested = (body.scope ?? '').split(' ').filter(Boolean)
    const scopes = requested.length > 0 ? requested : allowed
    if (scopes.some((scope) => !allowed.includes(scope))) {
      throw new BadRequestException({ error: 'invalid_scope' })
    }

    const privateKey = normalizePem(this.config.get<string>('INTEGRATION_DEV_PRIVATE_KEY'))
    if (!privateKey) {
      throw new BadRequestException({ error: 'server_misconfigured' })
    }

    const scope = scopes.join(' ')
    const token = jwt.sign({ scope, client_id: clientId }, privateKey, {
      algorithm: 'RS256',
      issuer: this.config.get<string>('INTEGRATION_JWT_ISSUER')?.trim(),
      audience: this.config.get<string>('INTEGRATION_JWT_AUDIENCE')?.trim(),
      subject: clientId,
      expiresIn: INTEGRATION_DEV_TOKEN_TTL_SECONDS,
      keyid: INTEGRATION_DEV_KID,
    })

    return {
      access_token: token,
      token_type: 'Bearer',
      expires_in: INTEGRATION_DEV_TOKEN_TTL_SECONDS,
      scope,
    }
  }
}
