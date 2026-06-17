import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString, MaxLength } from 'class-validator'

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
  @MaxLength(200)
  idempotencyKey?: string
}
