import type { CSSProperties } from 'react'
import { brand } from '../styles/brand'
import type { ToastMessage } from '../hooks/useToast'

interface ToastProps {
  message: ToastMessage | null
  onDismiss?: () => void
}

const TONE_STYLE: Record<ToastMessage['tone'], CSSProperties> = {
  success: {
    background: brand.successSoft,
    border: `1px solid ${brand.green100}`,
    color: brand.success,
  },
  info: {
    background: brand.green50,
    border: `1px solid ${brand.border}`,
    color: brand.inkSoft,
  },
}

/**
 * Toast efêmero, canto inferior. Anunciado de forma polida via role="status".
 * Padrão único de feedback de sucesso/informação (ver hook useToast).
 */
export function Toast({ message, onDismiss }: Readonly<ToastProps>) {
  if (!message) return null
  return (
    <div role="status" aria-live="polite" style={{ ...container, ...TONE_STYLE[message.tone] }}>
      <span>{message.text}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} style={closeButton} aria-label="Fechar aviso">
          ×
        </button>
      )}
    </div>
  )
}

const container: CSSProperties = {
  position: 'fixed',
  bottom: '1.25rem',
  right: '1.25rem',
  zIndex: 1000,
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
  padding: '0.75rem 1rem',
  borderRadius: 10,
  fontWeight: 600,
  fontSize: '0.92rem',
  maxWidth: 'min(90vw, 360px)',
  boxShadow: '0 6px 24px rgba(0,0,0,0.12)',
}

const closeButton: CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'inherit',
  fontSize: '1.15rem',
  lineHeight: 1,
  cursor: 'pointer',
  padding: 0,
}
