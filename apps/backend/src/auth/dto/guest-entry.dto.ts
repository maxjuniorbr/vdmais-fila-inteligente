import { EntryChannel } from '@prisma/client'
import { IsEnum, IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator'

export class GuestEntryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(70)
  firstName!: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(70)
  lastName!: string

  @IsString()
  @Matches(/^\d{10,11}$/, { message: 'O telefone deve ter 10 ou 11 dígitos' })
  phone!: string

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
