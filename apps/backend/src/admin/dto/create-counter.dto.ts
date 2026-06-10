import { IsInt, Max, Min } from 'class-validator'

export class CreateCounterDto {
  @IsInt()
  @Min(1)
  @Max(999)
  number!: number
}
