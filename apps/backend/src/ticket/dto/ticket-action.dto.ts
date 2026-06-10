import { IsString, IsNotEmpty, IsEnum, MaxLength } from 'class-validator'

export class CancelTicketDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string
}

export class RestoreTicketDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string
}

export enum CorrectionAction {
  FINISH = 'FINISH',
  CANCEL = 'CANCEL',
}

export class CorrectTicketDto {
  @IsEnum(CorrectionAction)
  action!: CorrectionAction

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string
}
