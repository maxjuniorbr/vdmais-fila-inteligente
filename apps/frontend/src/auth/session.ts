export type StaffRole = 'OPERATOR' | 'ATTENDANT' | 'MANAGER' | 'ADMIN'

export interface StaffProfile {
  id: string
  name: string
  role: StaffRole
  erId?: string
}

const MANAGEMENT_ER_KEY = 'managementErId'

export function saveStaffSession(token: string, user: StaffProfile) {
  sessionStorage.removeItem('erId')
  sessionStorage.removeItem(MANAGEMENT_ER_KEY)
  sessionStorage.removeItem('counterId')
  sessionStorage.setItem('token', token)
  sessionStorage.setItem('staffRole', user.role)
  sessionStorage.setItem('staffUserId', user.id)
  if (user.erId) sessionStorage.setItem('erId', user.erId)
  sessionStorage.setItem('userName', user.name)
}

export function hasStaffSession(allowedRoles: StaffRole[]): boolean {
  const token = sessionStorage.getItem('token')
  const role = sessionStorage.getItem('staffRole') as StaffRole | null
  return Boolean(token && role && allowedRoles.includes(role))
}

export function getStaffSessionProfile(): StaffProfile | null {
  const token = sessionStorage.getItem('token')
  const id = sessionStorage.getItem('staffUserId')
  const name = sessionStorage.getItem('userName')
  const role = sessionStorage.getItem('staffRole') as StaffRole | null
  const erId = sessionStorage.getItem('erId') ?? undefined
  const validRoles: StaffRole[] = ['OPERATOR', 'ATTENDANT', 'MANAGER', 'ADMIN']

  if (!token || !id || !name || !role || !validRoles.includes(role)) return null
  return { id, name, role, erId }
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

export function clearSession() {
  sessionStorage.removeItem('token')
  sessionStorage.removeItem('staffRole')
  sessionStorage.removeItem('staffUserId')
  sessionStorage.removeItem('erId')
  sessionStorage.removeItem('userName')
  sessionStorage.removeItem('counterId')
  sessionStorage.removeItem(MANAGEMENT_ER_KEY)
}

export async function logoutStaffSession() {
  const token = sessionStorage.getItem('token')
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
