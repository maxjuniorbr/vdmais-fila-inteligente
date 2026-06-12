import type { ReactNode } from 'react'
import { brand } from '../styles/brand'
import { layout } from '../styles/layout'
import { BrandMark } from './BrandMark'

interface AppHeaderProps {
  title: string
  subtitle?: string
  actions?: ReactNode
  onLogout?: () => void
  logoutLabel?: string
}

export function AppHeader({
  title,
  subtitle,
  actions,
  onLogout,
  logoutLabel = 'Sair',
}: Readonly<AppHeaderProps>) {
  return (
    <header className="gb-topbar" style={layout.topbar}>
      <div style={{ display: 'flex', alignItems: 'center', gap: `${brand.spacing[12]}px`, minWidth: 0 }}>
        <BrandMark size={34} />
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
