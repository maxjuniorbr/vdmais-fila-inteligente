import { useEffect } from 'react'
import type { ReactNode, CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { brand } from '../styles/brand'

interface BottomSheetProps {
  title: string
  children: ReactNode
  onClose: () => void
}

export function BottomSheet({ title, children, onClose }: Readonly<BottomSheetProps>) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div style={styles.root} role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Fechar" style={styles.backdrop} onClick={onClose} />
      <div style={styles.sheet}>
        <span style={styles.grabber} aria-hidden="true" />
        <h2 style={styles.title}>{title}</h2>
        <div>{children}</div>
      </div>
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
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: `${brand.spacing[12]}px ${brand.spacing[24]}px ${brand.spacing[32]}px`,
    background: brand.surface,
    borderRadius: `${brand.radius.large}px ${brand.radius.large}px 0 0`,
    boxShadow: '0 -8px 30px rgba(0, 0, 0, 0.12)',
    animation: 'gbSheetUp 240ms ease',
  },
  grabber: {
    display: 'block',
    width: 48,
    height: 5,
    margin: `0 auto ${brand.spacing[16]}px`,
    borderRadius: brand.radius.pill,
    background: brand.border,
  },
  title: {
    margin: `0 0 ${brand.spacing[16]}px`,
    fontSize: brand.typography.subtitle.fontSize,
    fontWeight: 600,
    color: brand.ink,
  },
}
