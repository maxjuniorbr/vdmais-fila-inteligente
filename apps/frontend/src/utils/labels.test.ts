import { describe, expect, it } from 'vitest'
import {
  counterStateLabel,
  counterStateTone,
  entryChannelLabel,
  roleLabel,
  ticketStateLabel,
  ticketStateTone,
} from './labels'

describe('labels', () => {
  it('maps ticket states and falls back for unknown', () => {
    expect(ticketStateLabel('WAITING')).toBe('Aguardando')
    expect(ticketStateLabel('IN_SERVICE')).toBe('Em atendimento')
    expect(ticketStateLabel('???')).toBe('Situação desconhecida')
  })

  it('maps counter states and falls back for unknown', () => {
    expect(counterStateLabel('ACTIVE')).toBe('Ativo')
    expect(counterStateLabel('PAUSED')).toBe('Pausado')
    expect(counterStateLabel('???')).toBe('Situação desconhecida')
  })

  it('maps entry channels and falls back for unknown', () => {
    expect(entryChannelLabel('QR_CODE')).toBe('QR Code')
    expect(entryChannelLabel('CHECKIN_ASSISTED')).toBe('Check-in assistido')
    expect(entryChannelLabel('???')).toBe('Canal não informado')
  })

  it('maps roles and falls back for unknown', () => {
    expect(roleLabel('ADMIN')).toBe('Administrador')
    expect(roleLabel('OPERATOR')).toBe('Operadora')
    expect(roleLabel('???')).toBe('Perfil não informado')
  })

  it('maps counter states to semantic badge tones', () => {
    expect(counterStateTone('ACTIVE')).toBe('success')
    expect(counterStateTone('IN_SERVICE')).toBe('info')
    expect(counterStateTone('CALLING')).toBe('info')
    expect(counterStateTone('PAUSED')).toBe('warning')
    expect(counterStateTone('UNAVAILABLE')).toBe('neutral')
    expect(counterStateTone('???')).toBe('neutral')
  })

  it('maps ticket states to semantic badge tones', () => {
    expect(ticketStateTone('WAITING')).toBe('warning')
    expect(ticketStateTone('CALLING')).toBe('info')
    expect(ticketStateTone('IN_SERVICE')).toBe('success')
    expect(ticketStateTone('PAUSED')).toBe('neutral')
    expect(ticketStateTone('FINISHED')).toBe('success')
    expect(ticketStateTone('NO_SHOW')).toBe('danger')
    expect(ticketStateTone('CANCELLED')).toBe('danger')
    expect(ticketStateTone('???')).toBe('neutral')
  })
})
