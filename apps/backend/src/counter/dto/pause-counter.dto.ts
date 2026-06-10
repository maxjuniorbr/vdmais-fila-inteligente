import { IsString, IsNotEmpty, MaxLength } from 'class-validator'

export class PauseCounterDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string
}
