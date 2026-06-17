import { ConfigService } from '@nestjs/config'
import { IntegrationJwtStrategy } from '../auth/integration-jwt.strategy'

const DEV_PUBLIC_KEY = String.raw`-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----`
const DEV_PUBLIC_KEY_PEM = '-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----'

function strategyWith(env: Record<string, string>): IntegrationJwtStrategy {
  const config = { get: (key: string) => env[key] } as unknown as ConfigService
  return new IntegrationJwtStrategy(config)
}

// passport-jwt normalizes both secretOrKey and secretOrKeyProvider into a single
// `_secretOrKeyProvider(req, rawJwt, done)` and stores verify options in
// `_verifOpts`. Reaching into them lets us assert the actual key source the
// strategy resolves — not merely that an instance was constructed.
type KeyProvider = (
  req: unknown,
  raw: unknown,
  done: (err: Error | null, key?: string) => void,
) => void
interface StrategyInternals {
  _secretOrKeyProvider: KeyProvider
  _verifOpts: {
    algorithms?: string[]
    issuer?: string
    audience?: string
    ignoreExpiration?: boolean
  }
}
function internals(strategy: IntegrationJwtStrategy): StrategyInternals {
  return strategy as unknown as StrategyInternals
}
// The static-key and fail-closed providers resolve synchronously.
function resolveKey(strategy: IntegrationJwtStrategy): { err: Error | null; key?: string } {
  let outcome: { err: Error | null; key?: string } = { err: new Error('not called') }
  internals(strategy)._secretOrKeyProvider(null, null, (err, key) => {
    outcome = { err, key }
  })
  return outcome
}

describe('IntegrationJwtStrategy', () => {
  it('verifies tokens as RS256-only, with issuer/audience and no expiry bypass', () => {
    const strategy = strategyWith({
      INTEGRATION_JWKS_URI: 'https://idp.example/.well-known/jwks.json',
      INTEGRATION_JWT_ISSUER: 'issuer',
      INTEGRATION_JWT_AUDIENCE: 'audience',
    })
    expect(internals(strategy)._verifOpts).toMatchObject({
      algorithms: ['RS256'],
      issuer: 'issuer',
      audience: 'audience',
      ignoreExpiration: false,
    })
    // The JWKS path must supply a key provider (resolved from Apigee at runtime),
    // not fall through to the fail-closed branch.
    expect(typeof internals(strategy)._secretOrKeyProvider).toBe('function')
  })

  it('resolves the normalized dev public key in development/test', () => {
    const strategy = strategyWith({
      NODE_ENV: 'test',
      INTEGRATION_DEV_PUBLIC_KEY: DEV_PUBLIC_KEY,
    })
    const { err, key } = resolveKey(strategy)
    expect(err).toBeNull()
    expect(key).toBe(DEV_PUBLIC_KEY_PEM)
  })

  it('ignores the dev public key outside development/test (fail-closed)', () => {
    const strategy = strategyWith({
      NODE_ENV: 'production',
      INTEGRATION_DEV_PUBLIC_KEY: DEV_PUBLIC_KEY,
    })
    // Even with a dev key present, production must resolve no key — so any token
    // (forged or not) is rejected for lack of a verification key.
    const { err, key } = resolveKey(strategy)
    expect(err).toBeInstanceOf(Error)
    expect(key).toBeUndefined()
  })

  it('fails closed when nothing is configured', () => {
    const strategy = strategyWith({})
    const { err, key } = resolveKey(strategy)
    expect(err).toBeInstanceOf(Error)
    expect(key).toBeUndefined()
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
