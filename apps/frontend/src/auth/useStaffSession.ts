import { useEffect, useState } from 'react'
import {
  getStaffSessionProfile,
  hasStaffSession,
  SESSION_EXPIRED_EVENT,
  type StaffProfile,
  type StaffRole,
} from './session'

export function useStaffSession(allowedRoles: StaffRole[]) {
  const [authenticated, setAuthenticated] = useState(() => hasStaffSession(allowedRoles))

  useEffect(() => {
    const onExpired = () => setAuthenticated(false)
    globalThis.addEventListener(SESSION_EXPIRED_EVENT, onExpired)
    return () => globalThis.removeEventListener(SESSION_EXPIRED_EVENT, onExpired)
  }, [])

  return [authenticated, setAuthenticated] as const
}

// Like useStaffSession, but exposes the full profile (name/role/erId) instead of
// a boolean — for screens that route or render by role. Shares the same 401
// handling: a server-side SESSION_EXPIRED_EVENT drops the profile back to null.
export function useStaffProfile() {
  const [profile, setProfile] = useState<StaffProfile | null>(() => getStaffSessionProfile())

  useEffect(() => {
    const onExpired = () => setProfile(null)
    globalThis.addEventListener(SESSION_EXPIRED_EVENT, onExpired)
    return () => globalThis.removeEventListener(SESSION_EXPIRED_EVENT, onExpired)
  }, [])

  return [profile, setProfile] as const
}
