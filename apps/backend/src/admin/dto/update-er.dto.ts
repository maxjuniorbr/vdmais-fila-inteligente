import { IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator'

export class UpdateERDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string

  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  qrCodeUrl?: string
}
