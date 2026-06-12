import { EntryChannel } from '@prisma/client'
import { IsEnum, IsString, IsNotEmpty, MaxLength, IsOptional } from 'class-validator'

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  credential!: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password!: string

  @IsString()
  @IsOptional()
  @MaxLength(40)
  erId?: string

  @IsEnum(EntryChannel)
  @IsOptional()
  entryChannel?: EntryChannel

  @IsString()
  @IsOptional()
  @MaxLength(2048)
  entryToken?: string
}
