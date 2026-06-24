import { IsString, IsOptional, IsIn, MaxLength } from 'class-validator'

// Motivos canônicos de pausa do caixa (§9.4). Quando reason === 'outro', o campo
// `detail` é obrigatório (validado no service).
export const COUNTER_PAUSE_REASONS = [
  'intervalo',
  'suporte operacional',
  'problema técnico',
  'fechamento de caixa',
  'outro',
] as const

export type CounterPauseReason = (typeof COUNTER_PAUSE_REASONS)[number]

export class PauseCounterDto {
  @IsIn(COUNTER_PAUSE_REASONS)
  reason!: CounterPauseReason

  @IsOptional()
  @IsString()
  @MaxLength(500)
  detail?: string
}
