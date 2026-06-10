import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator'
import { EntryChannel } from '@prisma/client'

export class CreateTicketDto {
  @IsString()
  @MaxLength(40)
  erId!: string

  @IsEnum(EntryChannel)
  entryChannel!: EntryChannel

  @IsString()
  @IsOptional()
  @MaxLength(40)
  representativeId?: string
}
