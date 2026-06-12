import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { makeStaffToken } from '../test/staffToken'
import { SESSION_EXPIRED_EVENT } from './session'
import { useStaffSession } from './useStaffSession'

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
