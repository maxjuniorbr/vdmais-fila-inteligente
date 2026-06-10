import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsOptional,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator'
import { IsCpf } from '../validators/is-cpf.validator'
import { IsNotFutureDate } from '../validators/is-not-future-date.validator'

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  fullName!: string

  @IsString()
  @IsCpf()
  cpf!: string

  @IsString()
  @Matches(/^\d{10,11}$/, { message: 'O telefone deve ter 10 ou 11 dígitos' })
  phone!: string

  @IsDateString()
  @IsNotFutureDate()
  birthDate!: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  reCode!: string

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string

  @IsString()
  @IsOptional()
  @MaxLength(40)
  erId?: string
}
