import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { generateKeyPairSync } from 'node:crypto'
import * as jwt from 'jsonwebtoken'
import { DevTokenService } from '../dev-token/dev-token.service'

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})

const baseEnv: Record<string, string> = {
  NODE_ENV: 'test',
  INTEGRATION_DEV_TOKEN_ENABLED: 'true',
  INTEGRATION_DEV_CLIENT_ID: 'legacy-erp',
  INTEGRATION_DEV_CLIENT_SECRET: 'sekret',
  INTEGRATION_DEV_ALLOWED_SCOPES: 'tickets:start tickets:finish',
  INTEGRATION_DEV_PRIVATE_KEY: privateKey,
  INTEGRATION_DEV_PUBLIC_KEY: publicKey,
  INTEGRATION_JWT_ISSUER: 'https://dev-local/integration',
  INTEGRATION_JWT_AUDIENCE: 'vdmais-fila-integration',
}

function svc(env: Record<string, string>): DevTokenService {
  return new DevTokenService({ get: (key: string) => env[key] } as unknown as ConfigService)
}

const validBody = { grant_type: 'client_credentials', client_id: 'legacy-erp', client_secret: 'sekret' }

describe('DevTokenService', () => {
  it('is enabled only in dev/test with the flag on', () => {
    expect(svc(baseEnv).isEnabled()).toBe(true)
    expect(svc({ ...baseEnv, INTEGRATION_DEV_TOKEN_ENABLED: 'false' }).isEnabled()).toBe(false)
    expect(svc({ ...baseEnv, NODE_ENV: 'production' }).isEnabled()).toBe(false)
  })

  it('hides the issuer (404) when disabled', () => {
    expect(() => svc({ ...baseEnv, NODE_ENV: 'production' }).issue(validBody)).toThrow(
      NotFoundException,
    )
  })

  it('rejects an unsupported grant type', () => {
    expect(() => svc(baseEnv).issue({ ...validBody, grant_type: 'password' })).toThrow(
      BadRequestException,
    )
  })

  it('rejects a wrong client secret of the same length (timing-safe compare)', () => {
    expect(() => svc(baseEnv).issue({ ...validBody, client_secret: 'badsec' })).toThrow(
      UnauthorizedException,
    )
  })

  it('rejects a wrong client secret of a different length and a wrong client id', () => {
    expect(() => svc(baseEnv).issue({ ...validBody, client_secret: 'short' })).toThrow(
      UnauthorizedException,
    )
    expect(() => svc(baseEnv).issue({ ...validBody, client_id: 'nope' })).toThrow(
      UnauthorizedException,
    )
  })

  it('rejects scopes outside the allowlist', () => {
    expect(() => svc(baseEnv).issue({ ...validBody, scope: 'tickets:delete' })).toThrow(
      BadRequestException,
    )
  })

  it('rejects when the signing key is missing', () => {
    expect(() => svc({ ...baseEnv, INTEGRATION_DEV_PRIVATE_KEY: '' }).issue(validBody)).toThrow(
      BadRequestException,
    )
  })

  it('issues a verifiable RS256 token with the requested scope', () => {
    const result = svc(baseEnv).issue({ ...validBody, scope: 'tickets:start' })
    expect(result.token_type).toBe('Bearer')
    expect(result.scope).toBe('tickets:start')
    const decoded = jwt.verify(result.access_token, publicKey, {
      algorithms: ['RS256'],
      issuer: baseEnv.INTEGRATION_JWT_ISSUER,
      audience: baseEnv.INTEGRATION_JWT_AUDIENCE,
    })
    expect(decoded).toMatchObject({ scope: 'tickets:start', client_id: 'legacy-erp' })
  })

  it('defaults to all allowed scopes when none are requested', () => {
    const result = svc(baseEnv).issue(validBody)
    expect(result.scope).toBe('tickets:start tickets:finish')
  })

  it('exposes the public JWK, or null when no key is configured', () => {
    expect(svc(baseEnv).publicJwk()).toMatchObject({
      kty: 'RSA',
      kid: 'integration-dev',
      use: 'sig',
      alg: 'RS256',
    })
    expect(svc({ ...baseEnv, INTEGRATION_DEV_PUBLIC_KEY: '' }).publicJwk()).toBeNull()
  })
})
