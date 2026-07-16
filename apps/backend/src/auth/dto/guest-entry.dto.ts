import { EntryChannel } from '@prisma/client'
import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator'
import { IsCpf } from '../validators/is-cpf.validator'
import { IsCleanName } from '../validators/is-clean-name.validator'

export class GuestEntryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(70)
  @IsCleanName()
  firstName!: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(70)
  @IsCleanName()
  lastName!: string

  @IsString()
  @IsCpf()
  cpf!: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  erId!: string

  @IsEnum(EntryChannel)
  entryChannel!: EntryChannel

  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  entryToken!: string
}
