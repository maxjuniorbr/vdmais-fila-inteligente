export type StaffRole = 'OPERATOR' | 'ATTENDANT' | 'MANAGER' | 'ADMIN'

export interface StaffProfile {
  id: string
  name: string
  role: StaffRole
  erId?: string
}

const TOKEN_KEY = 'token'
const NAME_KEY = 'userName'
const COUNTER_KEY = 'counterId'
const MANAGEMENT_ER_KEY = 'managementErId'

const VALID_ROLES = new Set<StaffRole>(['OPERATOR', 'ATTENDANT', 'MANAGER', 'ADMIN'])
const QUEUE_ENTRY_CHANNELS = new Set(['QR_CODE', 'LINK'])

export type QueueEntryChannel = 'QR_CODE' | 'LINK'

interface TokenClaims {
  sub?: string
  userId?: string
  role?: StaffRole
  erId?: string
  exp?: number
}

function decodeToken(token: string | null): TokenClaims | null {
  const payload = token?.split('.')[1]
  if (!payload) return null
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(json) as TokenClaims
  } catch {
    return null
  }
}

// Identity and authorization context are derived from the signed JWT — never
// from separate, writable storage keys. A tampered role/erId would require a
// validly signed token, which the client cannot forge. Expired tokens are
// treated as no session (proactive logout, not only on the next 401).
function activeClaims(): TokenClaims | null {
  const claims = decodeToken(sessionStorage.getItem(TOKEN_KEY))
  if (!claims?.role) return null
  if (typeof claims.exp === 'number' && claims.exp * 1000 <= Date.now()) {
    clearSession()
    return null
  }
  return claims
}

export function saveStaffSession(token: string, user: StaffProfile) {
  sessionStorage.removeItem(MANAGEMENT_ER_KEY)
  sessionStorage.removeItem(COUNTER_KEY)
  sessionStorage.setItem(TOKEN_KEY, token)
  sessionStorage.setItem(NAME_KEY, user.name)
}

export function hasStaffSession(allowedRoles: StaffRole[]): boolean {
  const role = activeClaims()?.role
  return Boolean(role && VALID_ROLES.has(role) && allowedRoles.includes(role))
}

export function getStaffSessionProfile(): StaffProfile | null {
  const claims = activeClaims()
  const id = claims?.userId ?? claims?.sub
  const role = claims?.role
  if (!id || !role || !VALID_ROLES.has(role)) return null
  return { id, name: getStaffName(), role, erId: claims?.erId }
}

export function getStaffRole(): StaffRole | null {
  return getStaffSessionProfile()?.role ?? null
}

export function getSessionERId(): string {
  return getStaffSessionProfile()?.erId ?? ''
}

export function getStaffName(): string {
  return sessionStorage.getItem(NAME_KEY) ?? ''
}

export function getManagementERId(): string {
  return sessionStorage.getItem(MANAGEMENT_ER_KEY) ?? ''
}

export function setManagementERId(erId: string): void {
  if (erId) {
    sessionStorage.setItem(MANAGEMENT_ER_KEY, erId)
  } else {
    sessionStorage.removeItem(MANAGEMENT_ER_KEY)
  }
}

export function getQueueEntryToken(erId: string | undefined): string | null {
  return erId ? sessionStorage.getItem(`queue-entry-token:${erId}`) : null
}

export function saveQueueEntryToken(erId: string, token: string): void {
  sessionStorage.setItem(`queue-entry-token:${erId}`, token)
}

export function getQueueEntryChannel(erId: string | undefined): QueueEntryChannel | null {
  if (!erId) return null
  const channel = sessionStorage.getItem(`queue-entry:${erId}`)
  return channel && QUEUE_ENTRY_CHANNELS.has(channel) ? (channel as QueueEntryChannel) : null
}

export function saveQueueEntryChannel(erId: string, channel: QueueEntryChannel): void {
  sessionStorage.setItem(`queue-entry:${erId}`, channel)
}

export function getQueueEntryPath(erId: string | undefined): string {
  if (!erId) return '/'
  const source = getQueueEntryChannel(erId) === 'LINK' ? '?source=link' : ''
  const token = getQueueEntryToken(erId)
  const entry = token ? `#entry=${token}` : ''
  return `/fila/${erId}${source}${entry}`
}

export function clearSession() {
  sessionStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem(NAME_KEY)
  sessionStorage.removeItem(COUNTER_KEY)
  sessionStorage.removeItem(MANAGEMENT_ER_KEY)
  // Drop legacy authorization keys that older builds may have left behind.
  sessionStorage.removeItem('staffRole')
  sessionStorage.removeItem('staffUserId')
  sessionStorage.removeItem('erId')
}

// Broadcast when the server rejects the session (401). Staff screens listen for
// this to drop back to the login form instead of leaving a stale, broken view.
export const SESSION_EXPIRED_EVENT = 'staff-session-expired'

export function notifySessionExpired() {
  clearSession()
  globalThis.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
}

export async function logoutStaffSession() {
  const token = sessionStorage.getItem(TOKEN_KEY)
  try {
    if (token) {
      await fetch('/api/telemetry/staff/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
    }
  } finally {
    clearSession()
  }
}
