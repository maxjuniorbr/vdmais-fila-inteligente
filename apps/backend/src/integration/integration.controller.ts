import { Body, Controller, Headers, HttpCode, Post, Request, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { IntegrationJwtGuard } from './auth/integration-jwt.guard'
import { IntegrationPrincipal } from './auth/integration-jwt.strategy'
import { ScopesGuard } from './auth/scopes.guard'
import { Scopes } from './auth/scopes.decorator'
import { IntegrationActionDto } from './dto/integration-action.dto'
import { IntegrationService } from './integration.service'
import {
  IDEMPOTENCY_KEY_MAX_LENGTH,
  SCOPE_TICKETS_FINISH,
  SCOPE_TICKETS_START,
} from './integration.constants'

@ApiTags('integration')
@ApiBearerAuth()
@Controller('integration/v1/atendimentos')
@UseGuards(IntegrationJwtGuard, ScopesGuard)
export class IntegrationController {
  constructor(private readonly integration: IntegrationService) {}

  @Post('iniciar')
  @HttpCode(200)
  @Scopes(SCOPE_TICKETS_START)
  @ApiOperation({
    summary: 'Marca o atendimento do(a) revendedor(a) como iniciado (CALLING → IN_SERVICE).',
  })
  @ApiResponse({ status: 200, description: 'Atendimento iniciado (ou já estava; idempotente).' })
  @ApiResponse({ status: 400, description: 'INVALID_IDENTIFIER — informe exatamente um entre reCode e cpf.' })
  @ApiResponse({ status: 403, description: 'INSUFFICIENT_SCOPE — token sem o scope tickets:start.' })
  @ApiResponse({ status: 404, description: 'REPRESENTATIVE_NOT_FOUND ou NO_ACTIVE_TICKET.' })
  @ApiResponse({
    status: 409,
    description: 'TICKET_NOT_CALLED, TICKET_ALREADY_CLOSED ou MULTIPLE_ACTIVE_TICKETS.',
  })
  iniciar(
    @Body() dto: IntegrationActionDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Request() req: { user: IntegrationPrincipal },
  ) {
    return this.integration.startService(this._withIdempotencyKey(dto, idempotencyKey), req.user)
  }

  @Post('encerrar')
  @HttpCode(200)
  @Scopes(SCOPE_TICKETS_FINISH)
  @ApiOperation({
    summary: 'Marca o atendimento como encerrado/faturado (IN_SERVICE → FINISHED).',
  })
  @ApiResponse({ status: 200, description: 'Atendimento encerrado (ou já estava; idempotente).' })
  @ApiResponse({ status: 400, description: 'INVALID_IDENTIFIER — informe exatamente um entre reCode e cpf.' })
  @ApiResponse({ status: 403, description: 'INSUFFICIENT_SCOPE — token sem o scope tickets:finish.' })
  @ApiResponse({ status: 404, description: 'REPRESENTATIVE_NOT_FOUND ou NO_ACTIVE_TICKET.' })
  @ApiResponse({
    status: 409,
    description: 'TICKET_NOT_IN_SERVICE, TICKET_ALREADY_CLOSED ou MULTIPLE_ACTIVE_TICKETS.',
  })
  encerrar(
    @Body() dto: IntegrationActionDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Request() req: { user: IntegrationPrincipal },
  ) {
    return this.integration.finishService(this._withIdempotencyKey(dto, idempotencyKey), req.user)
  }

  private _withIdempotencyKey(
    dto: IntegrationActionDto,
    headerKey: string | undefined,
  ): IntegrationActionDto {
    if (dto.idempotencyKey || !headerKey) return dto
    // O header não passa pelo ValidationPipe; trunca no mesmo limite do campo do
    // corpo para não persistir strings arbitrárias no AuditEvent.metadata.
    return { ...dto, idempotencyKey: headerKey.slice(0, IDEMPOTENCY_KEY_MAX_LENGTH) }
  }
}
