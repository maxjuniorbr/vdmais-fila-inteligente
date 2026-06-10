import type { ReactNode } from 'react'
import { layout } from '../styles/layout'
import { BrandMark } from './BrandMark'

interface AppHeaderProps {
  title: string
  subtitle?: string
  /** Right-aligned content (extra buttons, status, etc.) rendered before the logout button */
  actions?: ReactNode
  onLogout?: () => void
  logoutLabel?: string
}

/**
 * Shared full-width top bar used across all staff-facing screens.
 * Brand-green bar: emblem + title/subtitle on the left, actions + logout on the right.
 */
export function AppHeader({
  title,
  subtitle,
  actions,
  onLogout,
  logoutLabel = 'Sair',
}: Readonly<AppHeaderProps>) {
  return (
    <header className="gb-topbar" style={layout.topbar}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
        <BrandMark onDark size={34} />
        <div style={{ minWidth: 0 }}>
          <h1 style={layout.topbarTitle}>{title}</h1>
          {subtitle && <span style={layout.topbarSubtitle}>{subtitle}</span>}
        </div>
      </div>
      <div style={layout.actions}>
        {actions}
        {onLogout && (
          <button className="gb-button" style={layout.topbarButton} onClick={onLogout}>
            {logoutLabel}
          </button>
        )}
      </div>
    </header>
  )
}
