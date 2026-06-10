import {
  Controller,
  Get,
  Headers,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import { timingSafeEqual } from 'crypto'
import { Response } from 'express'
import { PrismaService } from '../prisma/prisma.service'
import { ObservabilityService } from './observability.service'

@Controller()
export class ObservabilityController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly observability: ObservabilityService,
  ) {}

  @Get('health/live')
  live() {
    return { status: 'ok', uptimeSeconds: this.observability.uptimeSeconds() }
  }

  @Get('health/ready')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`
      return { status: 'ready' }
    } catch {
      throw new ServiceUnavailableException('Banco de dados indisponível')
    }
  }

  @Get('observability/metrics')
  metrics(
    @Headers('authorization') authorization: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    // Fail closed: sem token configurado, o endpoint fica indisponível em vez
    // de expor métricas (nomes de rotas, volumes e latências) abertamente.
    const token = process.env.OBSERVABILITY_TOKEN
    if (!token) {
      throw new UnauthorizedException('Observabilidade não configurada')
    }
    if (!this._isAuthorized(authorization, `Bearer ${token}`)) {
      throw new UnauthorizedException('Token de observabilidade inválido')
    }
    response.type('text/plain; version=0.0.4')
    return this.observability.renderPrometheus()
  }

  /** Comparação em tempo constante para evitar timing attacks no token. */
  private _isAuthorized(provided: string | undefined, expected: string): boolean {
    if (!provided) return false
    const providedBuffer = Buffer.from(provided)
    const expectedBuffer = Buffer.from(expected)
    if (providedBuffer.length !== expectedBuffer.length) return false
    return timingSafeEqual(providedBuffer, expectedBuffer)
  }
}
