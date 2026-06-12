import { useEffect, useState } from 'react'
import { hasStaffSession, SESSION_EXPIRED_EVENT, type StaffRole } from './session'

export function useStaffSession(allowedRoles: StaffRole[]) {
  const [authenticated, setAuthenticated] = useState(() => hasStaffSession(allowedRoles))

  useEffect(() => {
    const onExpired = () => setAuthenticated(false)
    globalThis.addEventListener(SESSION_EXPIRED_EVENT, onExpired)
    return () => globalThis.removeEventListener(SESSION_EXPIRED_EVENT, onExpired)
  }, [])

  return [authenticated, setAuthenticated] as const
}
