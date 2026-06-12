import { useEffect, useState } from 'react'
import { hasStaffSession, SESSION_EXPIRED_EVENT, type StaffRole } from './session'

// Tracks whether the current staff session is valid for the given roles and
// reacts to a server-side 401 (via SESSION_EXPIRED_EVENT) by dropping back to
// the login state, so screens never linger in a broken, authenticated view.
export function useStaffSession(allowedRoles: StaffRole[]) {
  const [authenticated, setAuthenticated] = useState(() => hasStaffSession(allowedRoles))

  useEffect(() => {
    const onExpired = () => setAuthenticated(false)
    globalThis.addEventListener(SESSION_EXPIRED_EVENT, onExpired)
    return () => globalThis.removeEventListener(SESSION_EXPIRED_EVENT, onExpired)
  }, [])

  return [authenticated, setAuthenticated] as const
}
