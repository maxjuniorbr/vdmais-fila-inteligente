import { ConfigService } from '@nestjs/config'

const WEAK_JWT_SECRETS = new Set([
  'change-me',
  'change-me-in-production',
  'ci-test-secret',
  'secret',
  'changeme',
  'jwt-secret',
])

/** Comprimento mínimo exigido para o segredo em produção (≈ 256 bits em base64). */
const MIN_PRODUCTION_SECRET_LENGTH = 32

/**
 * Resolve e valida o segredo de assinatura do JWT.
 *
 * Falha fechado: produção, staging ou qualquer ambiente NÃO declarado
 * explicitamente como `development`/`test` exige um segredo forte. Assim,
 * esquecer de definir `NODE_ENV=production` não reabre a brecha de aceitar
 * um segredo fraco/conhecido (que permitiria forjar tokens de ADMIN).
 */
export function getJwtSecret(config: ConfigService): string {
  const secret = config.get<string>('JWT_SECRET')?.trim()
  if (!secret) {
    throw new Error('JWT_SECRET must be configured')
  }

  const nodeEnv = (config.get<string>('NODE_ENV') ?? '').toLowerCase()
  const isRelaxedEnv = nodeEnv === 'development' || nodeEnv === 'test'
  if (isRelaxedEnv) {
    return secret
  }

  if (WEAK_JWT_SECRETS.has(secret.toLowerCase())) {
    throw new Error(
      'JWT_SECRET must be replaced with a strong, unique production secret ' +
        '(set NODE_ENV=development only for local development).',
    )
  }
  if (secret.length < MIN_PRODUCTION_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET must have at least ${MIN_PRODUCTION_SECRET_LENGTH} characters outside development/test.`,
    )
  }

  return secret
}

export function getJwtExpiresInSeconds(config: ConfigService): number {
  // Fallback curto e igual ao default documentado (.env.example/compose.prod.yml):
  // um deploy sem a env não pode alongar silenciosamente a vida do token de staff.
  const value = config.get<string>('JWT_EXPIRES_IN')?.trim() || '8h'
  if (/^\d+$/.test(value)) return Number(value)

  const match = /^(\d+)([smhd])$/.exec(value)
  if (!match) throw new Error('JWT_EXPIRES_IN must use a value such as 15m, 12h, or 7d')

  const amount = Number(match[1])
  const multiplier = { s: 1, m: 60, h: 3600, d: 86400 }[match[2] as 's' | 'm' | 'h' | 'd']
  return amount * multiplier
}
