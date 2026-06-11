import { IsInt, IsOptional, IsString, IsUrl, Max, MaxLength, Min, MinLength } from 'class-validator'

export class CreateERDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string

  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  qrCodeUrl?: string

  // Tempo máximo de pausa em segundos (0 desativa). Máx. 24h.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(86400)
  pauseTimeoutSeconds?: number
}
