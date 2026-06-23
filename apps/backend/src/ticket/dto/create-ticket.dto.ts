import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator'
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

  // Atendimento preferencial. Só honrado quando quem cria é staff (check-in
  // assistido); ignorado para a própria representante, que não pode se autopromover.
  @IsBoolean()
  @IsOptional()
  isPriority?: boolean
}
