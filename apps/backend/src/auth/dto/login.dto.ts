import { IsString, IsNotEmpty, MaxLength, IsOptional } from 'class-validator'

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  credential!: string // CPF or reCode

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password!: string

  @IsString()
  @IsOptional()
  @MaxLength(40)
  erId?: string
}
