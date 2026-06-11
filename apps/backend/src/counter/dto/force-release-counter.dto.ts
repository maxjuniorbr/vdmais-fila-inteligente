import { IsString, IsNotEmpty, MaxLength } from 'class-validator'

export class ForceReleaseCounterDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string
}
