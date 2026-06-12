const TICKET_STATE_LABELS: Record<string, string> = {
  WAITING: 'Aguardando',
  CALLING: 'Chamando',
  IN_SERVICE: 'Em atendimento',
  FINISHED: 'Finalizada',
  NO_SHOW: 'Não compareceu',
  CANCELLED: 'Cancelada',
  PAUSED: 'Pausada',
}

const COUNTER_STATE_LABELS: Record<string, string> = {
  UNAVAILABLE: 'Indisponível',
  ACTIVE: 'Ativo',
  CALLING: 'Chamando',
  IN_SERVICE: 'Em atendimento',
  PAUSED: 'Pausado',
}

const ENTRY_CHANNEL_LABELS: Record<string, string> = {
  QR_CODE: 'QR Code',
  LINK: 'Link',
  CHECKIN_ASSISTED: 'Check-in assistido',
}

const ROLE_LABELS: Record<string, string> = {
  OPERATOR: 'Operadora',
  ATTENDANT: 'Atendente',
  MANAGER: 'Gestora',
  ADMIN: 'Administrador',
}

export function ticketStateLabel(state: string): string {
  return TICKET_STATE_LABELS[state] ?? 'Situação desconhecida'
}

export function counterStateLabel(state: string): string {
  return COUNTER_STATE_LABELS[state] ?? 'Situação desconhecida'
}

export function entryChannelLabel(channel: string): string {
  return ENTRY_CHANNEL_LABELS[channel] ?? 'Canal não informado'
}

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? 'Perfil não informado'
}

type BadgeTone = 'success' | 'warning' | 'info' | 'danger' | 'neutral'

const COUNTER_STATE_TONES: Record<string, BadgeTone> = {
  ACTIVE: 'success',
  IN_SERVICE: 'info',
  CALLING: 'info',
  PAUSED: 'warning',
  UNAVAILABLE: 'neutral',
}

export function counterStateTone(state: string): BadgeTone {
  return COUNTER_STATE_TONES[state] ?? 'neutral'
}
