import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString, MaxLength } from 'class-validator'
import { IDEMPOTENCY_KEY_MAX_LENGTH } from '../integration.constants'

export class IntegrationActionDto {
  @ApiPropertyOptional({ description: 'Código oficial da revendedora (reCode). Informe reCode OU cpf.' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  reCode?: string

  @ApiPropertyOptional({ description: 'CPF da revendedora, com ou sem máscara. Informe reCode OU cpf.' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  cpf?: string

  @ApiPropertyOptional({
    description: 'Restringe a ação a este ER (asserção opcional do chamador).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  erId?: string

  @ApiPropertyOptional({ description: 'Chave de idempotência para correlação de retries.' })
  @IsOptional()
  @IsString()
  @MaxLength(IDEMPOTENCY_KEY_MAX_LENGTH)
  idempotencyKey?: string
}
