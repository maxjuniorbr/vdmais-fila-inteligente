import type { StaffRole } from '../auth/session'

function base64url(value: object): string {
  return btoa(JSON.stringify(value))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** Builds a decodable (unsigned) staff JWT for tests. */
export function makeStaffToken(claims: {
  id?: string
  role: StaffRole
  erId?: string
  expiresInSeconds?: number
}): string {
  const { id = 'user-1', role, erId, expiresInSeconds = 3600 } = claims
  const payload = {
    sub: id,
    userId: id,
    role,
    erId,
    sv: 0,
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
  }
  return `header.${base64url(payload)}.signature`
}

/** Seeds a staff session in sessionStorage the way a real login would. */
export function seedStaffSession(profile: {
  id?: string
  name?: string
  role: StaffRole
  erId?: string
  expiresInSeconds?: number
}): void {
  sessionStorage.setItem('token', makeStaffToken(profile))
  sessionStorage.setItem('userName', profile.name ?? 'Staff')
}
