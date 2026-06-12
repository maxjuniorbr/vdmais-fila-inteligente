import { describe, expect, it, vi } from 'vitest'
import { makeStaffToken } from '../test/staffToken'
import {
  clearSession,
  getManagementERId,
  getStaffSessionProfile,
  hasStaffSession,
  logoutStaffSession,
  saveStaffSession,
  setManagementERId,
  type StaffRole,
} from './session'

const profile = {
  id: 'staff-1',
  name: 'Pessoa Operadora',
  role: 'OPERATOR' as const,
  erId: 'er-1',
}

type ProfileOverrides = Partial<{ id: string; name: string; role: StaffRole; erId?: string }>

function login(overrides: ProfileOverrides = {}, expiresInSeconds?: number) {
  const merged = { ...profile, ...overrides }
  saveStaffSession(
    makeStaffToken({ id: merged.id, role: merged.role, erId: merged.erId, expiresInSeconds }),
    merged,
  )
  return merged
}

describe('staff session', () => {
  it('derives identity from the token and replaces stale staff context', () => {
    sessionStorage.setItem('managementErId', 'old-er')
    sessionStorage.setItem('counterId', 'old-counter')

    login()

    expect(getStaffSessionProfile()).toEqual(profile)
    expect(hasStaffSession(['OPERATOR'])).toBe(true)
    expect(hasStaffSession(['ADMIN'])).toBe(false)
    expect(sessionStorage.getItem('managementErId')).toBeNull()
    expect(sessionStorage.getItem('counterId')).toBeNull()
  })

  it('does not trust a tampered role key in storage', () => {
    login()
    sessionStorage.setItem('staffRole', 'ADMIN')

    expect(getStaffSessionProfile()?.role).toBe('OPERATOR')
    expect(hasStaffSession(['ADMIN'])).toBe(false)
  })

  it('supports staff profiles without an assigned ER', () => {
    login({ role: 'ADMIN', erId: undefined })

    expect(getStaffSessionProfile()).toEqual({
      id: 'staff-1',
      name: 'Pessoa Operadora',
      role: 'ADMIN',
      erId: undefined,
    })
  })

  it('rejects a session without a token', () => {
    expect(getStaffSessionProfile()).toBeNull()
    expect(hasStaffSession(['OPERATOR'])).toBe(false)
  })

  it('rejects a token without a valid role', () => {
    sessionStorage.setItem('token', makeStaffToken({ role: 'INVALID' as never }))
    expect(getStaffSessionProfile()).toBeNull()
  })

  it('rejects and clears an expired token', () => {
    login({}, -10)
    expect(getStaffSessionProfile()).toBeNull()
    expect(sessionStorage.getItem('token')).toBeNull()
  })

  it('sets and clears the selected management ER', () => {
    setManagementERId('er-2')
    expect(getManagementERId()).toBe('er-2')

    setManagementERId('')
    expect(getManagementERId()).toBe('')
  })

  it('clears every session-scoped staff value', () => {
    login()
    sessionStorage.setItem('counterId', 'counter-1')
    setManagementERId('er-2')

    clearSession()

    expect(sessionStorage.length).toBe(0)
  })

  it('records logout telemetry before clearing the session', async () => {
    const merged = login()
    const token = sessionStorage.getItem('token')
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)

    await logoutStaffSession()

    expect(fetchMock).toHaveBeenCalledWith('/api/telemetry/staff/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(merged.role).toBe('OPERATOR')
    expect(sessionStorage.length).toBe(0)
  })

  it('clears the session even when logout telemetry fails', async () => {
    login()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network unavailable')))

    await expect(logoutStaffSession()).rejects.toThrow('network unavailable')
    expect(sessionStorage.length).toBe(0)
  })

  it('does not send telemetry when there is no token', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await logoutStaffSession()

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
