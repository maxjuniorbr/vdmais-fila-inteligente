import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { layout } from '../styles/layout'
import { brand } from '../styles/brand'
import { Alert } from './Alert'
import { Button } from './Button'

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

interface ConfirmDialogProps {
  title: string
  description?: string
  reasonPlaceholder?: string
  reasonRequired?: boolean
  loading?: boolean
  error?: string | null
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: (reason: string) => void
  onClose: () => void
}

export function ConfirmDialog({
  title,
  description,
  reasonPlaceholder = 'Motivo obrigatório',
  reasonRequired = true,
  loading = false,
  error,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Fechar',
  onConfirm,
  onClose,
}: Readonly<ConfirmDialogProps>) {
  const [reason, setReason] = useState('')
  const canConfirm = !reasonRequired || reason.trim().length > 0
  const titleId = useId()
  const descriptionId = useId()
  const reasonId = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const activeDialog: HTMLDialogElement = dialog

    function containFocus(event: KeyboardEvent) {
      if (event.key !== 'Tab') return

      const focusable = Array.from(
        activeDialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      )
      if (focusable.length === 0) {
        event.preventDefault()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    const previouslyFocused = document.activeElement as HTMLElement | null
    if (!activeDialog.open) activeDialog.showModal()
    activeDialog.addEventListener('keydown', containFocus)
    textareaRef.current?.focus()

    return () => {
      activeDialog.removeEventListener('keydown', containFocus)
      if (activeDialog.open) activeDialog.close()
      previouslyFocused?.focus()
    }
  }, [])

  return createPortal(
    <dialog
      ref={dialogRef}
      className="gb-confirm-dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      style={{ ...layout.modal, border: 'none', margin: 'auto' }}
    >
        <h3 id={titleId} style={styles.title}>{title}</h3>
        {description && (
          <p id={descriptionId} style={styles.description}>{description}</p>
        )}
        <label htmlFor={reasonId} style={styles.label}>
          {reasonPlaceholder}
        </label>
        <textarea
          id={reasonId}
          ref={textareaRef}
          className="gb-control"
          rows={4}
          required={reasonRequired}
          placeholder={reasonPlaceholder}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          style={styles.textarea}
        />
        {error && <Alert tone="error">{error}</Alert>}
        <div style={layout.actions}>
          <Button onClick={() => onConfirm(reason.trim())} disabled={loading || !canConfirm}>
            {confirmLabel}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            {cancelLabel}
          </Button>
        </div>
    </dialog>,
    document.body,
  )
}

const styles: Record<string, React.CSSProperties> = {
  title: {
    margin: 0,
    fontSize: brand.typography.subtitle.fontSize,
    fontWeight: 700,
    color: brand.ink,
  },
  description: {
    margin: 0,
    fontSize: brand.typography.bodySmall.fontSize,
    color: brand.inkSoft,
  },
  label: {
    fontSize: brand.typography.bodySmall.fontSize,
    fontWeight: 600,
    color: brand.inkSoft,
  },
  textarea: {
    width: '100%',
    padding: `${brand.spacing[12]}px`,
    border: `1px solid ${brand.borderStrong}`,
    borderRadius: brand.radius.medium,
    resize: 'vertical',
    fontFamily: 'inherit',
    fontSize: brand.typography.bodyLarge.fontSize,
    boxSizing: 'border-box',
    color: brand.ink,
  },
}
