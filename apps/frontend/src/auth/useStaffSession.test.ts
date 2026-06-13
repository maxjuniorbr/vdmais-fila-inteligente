import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { makeStaffToken, seedStaffSession } from '../test/staffToken'
import { SESSION_EXPIRED_EVENT } from './session'
import { useStaffProfile, useStaffSession } from './useStaffSession'

describe('useStaffSession', () => {
  afterEach(() => {
    sessionStorage.clear()
  })

  it('starts authenticated when the token grants an allowed role', () => {
    sessionStorage.setItem('token', makeStaffToken({ role: 'OPERATOR' }))

    const { result } = renderHook(() => useStaffSession(['OPERATOR']))

    expect(result.current[0]).toBe(true)
  })

  it('starts unauthenticated when the role is not allowed', () => {
    sessionStorage.setItem('token', makeStaffToken({ role: 'ATTENDANT' }))

    const { result } = renderHook(() => useStaffSession(['OPERATOR']))

    expect(result.current[0]).toBe(false)
  })

  it('drops to unauthenticated when a session-expired event fires', () => {
    sessionStorage.setItem('token', makeStaffToken({ role: 'OPERATOR' }))

    const { result } = renderHook(() => useStaffSession(['OPERATOR']))
    expect(result.current[0]).toBe(true)

    act(() => {
      globalThis.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
    })

    expect(result.current[0]).toBe(false)
  })
})

describe('useStaffProfile', () => {
  afterEach(() => {
    sessionStorage.clear()
  })

  it('starts with the profile derived from the active token', () => {
    seedStaffSession({ id: 'a1', name: 'Admin Teste', role: 'ADMIN' })

    const { result } = renderHook(() => useStaffProfile())

    expect(result.current[0]).toEqual({
      id: 'a1',
      name: 'Admin Teste',
      role: 'ADMIN',
      erId: undefined,
    })
  })

  it('starts null when there is no session', () => {
    const { result } = renderHook(() => useStaffProfile())

    expect(result.current[0]).toBeNull()
  })

  it('drops the profile to null when a session-expired event fires', () => {
    seedStaffSession({ id: 'op1', name: 'Operadora Teste', role: 'OPERATOR', erId: 'er-1' })

    const { result } = renderHook(() => useStaffProfile())
    expect(result.current[0]?.role).toBe('OPERATOR')

    act(() => {
      globalThis.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
    })

    expect(result.current[0]).toBeNull()
  })
})
