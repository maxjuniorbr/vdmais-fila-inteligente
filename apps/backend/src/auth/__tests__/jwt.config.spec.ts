import { ConfigService } from '@nestjs/config'
import { getJwtSecret } from '../jwt.config'

function configWith(values: Record<string, string | undefined>): ConfigService {
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService
}

const STRONG_SECRET = 'k9Xy2P8qL4mZ7wR3tV6nB1cD5fH0jA8sQ2eU4yT6oI9pL3a'

describe('getJwtSecret', () => {
  it('throws when the secret is missing', () => {
    expect(() => getJwtSecret(configWith({ NODE_ENV: 'production' }))).toThrow(
      'JWT_SECRET must be configured',
    )
  })

  describe('relaxed environments (development/test)', () => {
    it('allows the weak default in development', () => {
      const config = configWith({ NODE_ENV: 'development', JWT_SECRET: 'change-me-in-production' })
      expect(getJwtSecret(config)).toBe('change-me-in-production')
    })

    it('allows a short secret in test', () => {
      const config = configWith({ NODE_ENV: 'test', JWT_SECRET: 'ci-test-secret' })
      expect(getJwtSecret(config)).toBe('ci-test-secret')
    })
  })

  describe('strict environments (fail closed)', () => {
    it('rejects a known weak secret in production', () => {
      const config = configWith({ NODE_ENV: 'production', JWT_SECRET: 'change-me-in-production' })
      expect(() => getJwtSecret(config)).toThrow(/strong, unique production secret/)
    })

    it('rejects a known weak secret case-insensitively', () => {
      const config = configWith({ NODE_ENV: 'production', JWT_SECRET: 'Secret' })
      expect(() => getJwtSecret(config)).toThrow(/strong, unique production secret/)
    })

    it('rejects a short secret in production', () => {
      const config = configWith({ NODE_ENV: 'production', JWT_SECRET: 'short-but-unknown' })
      expect(() => getJwtSecret(config)).toThrow(/at least 32 characters/)
    })

    it('rejects a weak secret when NODE_ENV is unset (defaults to strict)', () => {
      const config = configWith({ JWT_SECRET: 'change-me-in-production' })
      expect(() => getJwtSecret(config)).toThrow(/strong, unique production secret/)
    })

    it('rejects a short secret when NODE_ENV is an unknown value', () => {
      const config = configWith({ NODE_ENV: 'staging', JWT_SECRET: 'tooshort' })
      expect(() => getJwtSecret(config)).toThrow(/at least 32 characters/)
    })

    it('accepts a strong secret in production', () => {
      const config = configWith({ NODE_ENV: 'production', JWT_SECRET: STRONG_SECRET })
      expect(getJwtSecret(config)).toBe(STRONG_SECRET)
    })
  })
})
