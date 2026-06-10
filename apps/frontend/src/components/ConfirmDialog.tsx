import { useEffect, useId, useRef, useState } from 'react'
import { layout } from '../styles/layout'
import { brand } from '../styles/brand'
import { Button } from './Button'

interface ConfirmDialogProps {
  /** Dialog title */
  title: string
  /** Brief description / subtitle shown below the title */
  description?: string
  /** Label for the text area placeholder */
  reasonPlaceholder?: string
  /** Whether reason is mandatory (default: true) */
  reasonRequired?: boolean
  /** Loading state — disables buttons */
  loading?: boolean
  /** Confirm button label */
  confirmLabel?: string
  /** Cancel/close button label */
  cancelLabel?: string
  /** Called with the reason text when the user confirms */
  onConfirm: (reason: string) => void
  /** Called when the user closes/cancels the dialog */
  onClose: () => void
}

/**
 * Reusable confirmation modal with an optional mandatory reason field.
 * Accessible: role="dialog", labelled title, Escape to close, initial focus
 * on the reason field. Used for cancel, restore, and correction flows.
 */
export function ConfirmDialog({
  title,
  description,
  reasonPlaceholder = 'Motivo obrigatório',
  reasonRequired = true,
  loading = false,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Fechar',
  onConfirm,
  onClose,
}: Readonly<ConfirmDialogProps>) {
  const [reason, setReason] = useState('')
  const canConfirm = !reasonRequired || reason.trim().length > 0
  const titleId = useId()
  const descriptionId = useId()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div style={layout.overlay}>
      <dialog
        open
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        style={{ ...layout.modal, position: 'static', border: 'none' }}
      >
        <h3 id={titleId} style={styles.title}>{title}</h3>
        {description && (
          <p id={descriptionId} style={styles.description}>{description}</p>
        )}
        <textarea
          ref={textareaRef}
          className="gb-control"
          rows={4}
          aria-label={reasonPlaceholder}
          placeholder={reasonPlaceholder}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          style={styles.textarea}
        />
        <div style={layout.actions}>
          <Button onClick={() => onConfirm(reason.trim())} disabled={loading || !canConfirm}>
            {confirmLabel}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            {cancelLabel}
          </Button>
        </div>
      </dialog>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  title: {
    margin: 0,
    fontSize: '1.1rem',
    fontWeight: 700,
    color: brand.green800,
  },
  description: {
    margin: 0,
    fontSize: '0.9rem',
    color: brand.inkSoft,
  },
  textarea: {
    width: '100%',
    padding: '0.6rem',
    border: `1px solid ${brand.borderStrong}`,
    borderRadius: 10,
    resize: 'vertical',
    fontFamily: 'inherit',
    fontSize: '0.9rem',
    boxSizing: 'border-box',
    color: brand.ink,
  },
}
