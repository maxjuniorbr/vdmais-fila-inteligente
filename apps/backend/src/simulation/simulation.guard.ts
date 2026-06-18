import { CanActivate, ForbiddenException, Injectable } from '@nestjs/common'

/**
 * Protege todos os endpoints do simulador (ferramenta interna de dev/QA/demo).
 * Falha FECHADO, igual aos demais recursos só-de-dev do código (jwt.config.ts,
 * dev-token.service.ts): só libera quando NODE_ENV é explicitamente
 * 'development' ou 'test'. Qualquer outro valor (inclusive vazio/ausente) é
 * tratado como ambiente sensível e bloqueia — assim, esquecer de definir
 * NODE_ENV=production NÃO reabre o simulador.
 *
 * Camada extra: exige banco local. SIMULATION_ALLOW_REMOTE=true libera um banco
 * remoto apenas em ambiente não-produtivo (a checagem de NODE_ENV acima continua
 * valendo), nunca em produção.
 */
@Injectable()
export class SimulationGuard implements CanActivate {
  canActivate(): boolean {
    const nodeEnv = (process.env.NODE_ENV ?? '').toLowerCase()
    const isNonProd = nodeEnv === 'development' || nodeEnv === 'test'
    if (!isNonProd) {
      throw new ForbiddenException('Simulation is disabled outside development/test')
    }
    const databaseUrl = process.env.DATABASE_URL ?? ''
    const isLocal =
      databaseUrl.includes('localhost') ||
      databaseUrl.includes('127.0.0.1') ||
      databaseUrl.includes('::1')
    if (!isLocal && process.env.SIMULATION_ALLOW_REMOTE !== 'true') {
      throw new ForbiddenException('Simulation requires a local database')
    }
    return true
  }
}
