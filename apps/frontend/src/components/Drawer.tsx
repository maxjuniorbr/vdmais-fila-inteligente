import { useEffect } from 'react'
import type { ReactNode, CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { brand } from '../styles/brand'

interface DrawerProps {
  title: string
  children: ReactNode
  onClose: () => void
}

/** Gaveta lateral de navegação (H3 — fecha por botão, Esc ou backdrop). */
export function Drawer({ title, children, onClose }: Readonly<DrawerProps>) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div style={styles.root}>
      <button type="button" aria-label="Fechar" style={styles.backdrop} onClick={onClose} />
      <nav style={styles.panel} aria-label={title}>
        <div style={styles.header}>
          <strong style={styles.title}>{title}</strong>
          <button
            type="button"
            className="gb-button"
            aria-label="Fechar menu"
            onClick={onClose}
            style={styles.close}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
        <div style={styles.content}>{children}</div>
      </nav>
    </div>,
    document.body,
  )
}

const styles: Record<string, CSSProperties> = {
  root: { position: 'fixed', inset: 0, zIndex: 50 },
  backdrop: {
    position: 'absolute',
    inset: 0,
    border: 'none',
    padding: 0,
    background: brand.overlay,
    cursor: 'pointer',
    animation: 'gbOverlayIn 180ms ease',
  },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 'min(280px, 80vw)',
    display: 'flex',
    flexDirection: 'column',
    background: brand.surface,
    boxShadow: '8px 0 30px rgba(0, 0, 0, 0.16)',
    animation: 'gbDrawerIn 240ms ease',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
    padding: `0 ${brand.spacing[16]}px`,
    borderBottom: `1px solid ${brand.border}`,
  },
  title: {
    fontSize: brand.typography.bodyLarge.fontSize,
    fontWeight: 700,
    color: brand.ink,
  },
  close: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    border: 'none',
    borderRadius: '50%',
    background: 'transparent',
    color: brand.inkMuted,
    cursor: 'pointer',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: `${brand.spacing[4]}px`,
    padding: `${brand.spacing[16]}px`,
  },
}
