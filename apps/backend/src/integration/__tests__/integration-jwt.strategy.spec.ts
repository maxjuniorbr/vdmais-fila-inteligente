import { ConfigService } from '@nestjs/config'
import { IntegrationJwtStrategy } from '../auth/integration-jwt.strategy'

const DEV_PUBLIC_KEY = String.raw`-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----`

function strategyWith(env: Record<string, string>): IntegrationJwtStrategy {
  const config = { get: (key: string) => env[key] } as unknown as ConfigService
  return new IntegrationJwtStrategy(config)
}

describe('IntegrationJwtStrategy', () => {
  it('builds with a JWKS provider when INTEGRATION_JWKS_URI is set (Apigee path)', () => {
    const strategy = strategyWith({
      INTEGRATION_JWKS_URI: 'https://idp.example/.well-known/jwks.json',
      INTEGRATION_JWT_ISSUER: 'issuer',
      INTEGRATION_JWT_AUDIENCE: 'audience',
    })
    expect(strategy).toBeInstanceOf(IntegrationJwtStrategy)
  })

  it('builds with the local dev public key in development/test when no JWKS URI is set', () => {
    const strategy = strategyWith({
      NODE_ENV: 'test',
      INTEGRATION_DEV_PUBLIC_KEY: DEV_PUBLIC_KEY,
    })
    expect(strategy).toBeInstanceOf(IntegrationJwtStrategy)
  })

  it('ignores the dev public key outside development/test (fail-closed)', () => {
    const strategy = strategyWith({
      NODE_ENV: 'production',
      INTEGRATION_DEV_PUBLIC_KEY: DEV_PUBLIC_KEY,
    })
    expect(strategy).toBeInstanceOf(IntegrationJwtStrategy)
  })

  it('builds fail-closed when nothing is configured', () => {
    expect(() => strategyWith({})).not.toThrow()
  })

  it('extracts scopes from a space-delimited OAuth scope claim', () => {
    const strategy = strategyWith({})
    expect(strategy.validate({ scope: 'tickets:start tickets:finish', client_id: 'erp' })).toEqual({
      type: 'integration',
      client: 'erp',
      scopes: ['tickets:start', 'tickets:finish'],
    })
  })

  it('extracts scopes from an scp array and falls back to azp/sub for the client', () => {
    const strategy = strategyWith({})
    expect(strategy.validate({ scp: ['tickets:start'], azp: 'app' })).toEqual({
      type: 'integration',
      client: 'app',
      scopes: ['tickets:start'],
    })
    expect(strategy.validate({ sub: 'svc' })).toEqual({
      type: 'integration',
      client: 'svc',
      scopes: [],
    })
  })
})
