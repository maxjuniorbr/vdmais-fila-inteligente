import { describe, expect, it, vi } from 'vitest'
import {
  clearSession,
  getManagementERId,
  getStaffSessionProfile,
  hasStaffSession,
  logoutStaffSession,
  saveStaffSession,
  setManagementERId,
} from './session'

const profile = {
  id: 'staff-1',
  name: 'Pessoa Operadora',
  role: 'OPERATOR' as const,
  erId: 'er-1',
}

describe('staff session', () => {
  it('replaces stale staff context when saving a session', () => {
    sessionStorage.setItem('managementErId', 'old-er')
    sessionStorage.setItem('counterId', 'old-counter')

    saveStaffSession('token-1', profile)

    expect(getStaffSessionProfile()).toEqual(profile)
    expect(hasStaffSession(['OPERATOR'])).toBe(true)
    expect(hasStaffSession(['ADMIN'])).toBe(false)
    expect(sessionStorage.getItem('managementErId')).toBeNull()
    expect(sessionStorage.getItem('counterId')).toBeNull()
  })

  it('supports staff profiles without an assigned ER', () => {
    saveStaffSession('token-1', { ...profile, role: 'ADMIN', erId: undefined })

    expect(getStaffSessionProfile()).toEqual({
      id: 'staff-1',
      name: 'Pessoa Operadora',
      role: 'ADMIN',
      erId: undefined,
    })
    expect(sessionStorage.getItem('erId')).toBeNull()
  })

  it.each(['token', 'staffUserId', 'userName', 'staffRole'])(
    'rejects incomplete or invalid sessions when %s is missing',
    (key) => {
      saveStaffSession('token-1', profile)
      if (key === 'staffRole') {
        sessionStorage.setItem(key, 'INVALID')
      } else {
        sessionStorage.removeItem(key)
      }

      expect(getStaffSessionProfile()).toBeNull()
    },
  )

  it('sets and clears the selected management ER', () => {
    setManagementERId('er-2')
    expect(getManagementERId()).toBe('er-2')

    setManagementERId('')
    expect(getManagementERId()).toBe('')
  })

  it('clears every session-scoped staff value', () => {
    saveStaffSession('token-1', profile)
    sessionStorage.setItem('counterId', 'counter-1')
    setManagementERId('er-2')

    clearSession()

    expect(sessionStorage.length).toBe(0)
  })

  it('records logout telemetry before clearing the session', async () => {
    saveStaffSession('token-1', profile)
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)

    await logoutStaffSession()

    expect(fetchMock).toHaveBeenCalledWith('/api/telemetry/staff/logout', {
      method: 'POST',
      headers: { Authorization: 'Bearer token-1' },
    })
    expect(sessionStorage.length).toBe(0)
  })

  it('clears the session even when logout telemetry fails', async () => {
    saveStaffSession('token-1', profile)
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

