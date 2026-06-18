import { ArrayNotEmpty, IsArray, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator'
import { EntryChannel } from '@prisma/client'

export class OpenCountersDto {
  @IsString()
  @MaxLength(40)
  erId!: string

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  counterIds!: string[]
}

export class CloseCounterDto {
  @IsString()
  @MaxLength(40)
  erId!: string

  @IsString()
  @MaxLength(40)
  counterId!: string
}

export class TicketActionDto {
  @IsString()
  @MaxLength(40)
  ticketId!: string
}

export class CounterActionDto {
  @IsString()
  @MaxLength(40)
  counterId!: string
}

export class AddRepresentativesDto {
  @IsString()
  @MaxLength(40)
  erId!: string

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  representativeIds!: string[]

  @IsEnum(EntryChannel)
  @IsOptional()
  channel?: EntryChannel
}

