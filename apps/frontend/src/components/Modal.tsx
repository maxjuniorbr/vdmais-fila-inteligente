import { useEffect, useId, useRef } from 'react'
import type { ReactNode, CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { brand } from '../styles/brand'

interface ModalProps {
  title: string
  children: ReactNode
  footer?: ReactNode
  onClose: () => void
}

export function Modal({ title, children, footer, onClose }: Readonly<ModalProps>) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    if (!dialog.open) dialog.showModal()
    // Fecha ao clicar no backdrop. Registrado imperativamente (e não via prop onClick)
    // porque um <dialog> é "não interativo" para as regras de a11y; o teclado já é
    // coberto pelo onCancel (Esc) e pelo foco preso do showModal().
    const onBackdropClick = (event: MouseEvent) => {
      if (event.target === dialog) onCloseRef.current()
    }
    dialog.addEventListener('click', onBackdropClick)
    return () => {
      dialog.removeEventListener('click', onBackdropClick)
      if (dialog.open) dialog.close()
      previouslyFocused?.focus()
    }
  }, [])

  return createPortal(
    <dialog
      ref={dialogRef}
      className="gb-confirm-dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      style={styles.dialog}
    >
      <div style={styles.body}>
        <div style={styles.header}>
          <h2 id={titleId} style={styles.title}>
            {title}
          </h2>
          <button
            type="button"
            className="gb-button"
            aria-label="Fechar"
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
      </div>
      {footer && <div style={styles.footer}>{footer}</div>}
    </dialog>,
    document.body,
  )
}

const styles: Record<string, CSSProperties> = {
  dialog: {
    width: 'min(480px, 100%)',
    padding: 0,
    border: 'none',
    borderRadius: brand.radius.large,
    background: brand.surface,
    color: brand.ink,
    boxShadow: brand.shadow,
    margin: 'auto',
    animation: 'gbOverlayIn 180ms ease',
  },
  body: {
    padding: `${brand.spacing[24]}px`,
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: `${brand.spacing[16]}px`,
    marginBottom: `${brand.spacing[12]}px`,
  },
  title: {
    margin: 0,
    fontSize: brand.typography.subtitle.fontSize,
    fontWeight: 600,
    color: brand.ink,
  },
  close: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 44,
    border: 'none',
    borderRadius: '50%',
    background: 'transparent',
    color: brand.inkMuted,
    cursor: 'pointer',
  },
  content: {
    fontSize: brand.typography.bodyLarge.fontSize,
    color: brand.inkSoft,
    lineHeight: 1.5,
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: `${brand.spacing[12]}px`,
    flexWrap: 'wrap',
    padding: `${brand.spacing[16]}px ${brand.spacing[24]}px`,
    background: brand.canvas,
    borderTop: `1px solid ${brand.border}`,
    borderRadius: `0 0 ${brand.radius.large}px ${brand.radius.large}px`,
  },
}
