import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { brand } from '../styles/brand'

type ToastTone = 'success' | 'error' | 'info' | 'warning'

interface ToastItem {
  id: number
  message: string
  tone: ToastTone
}

interface ToastContextValue {
  showToast: (message: string, tone?: ToastTone) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const TONE_STYLE: Record<ToastTone, CSSProperties> = {
  success: { background: brand.successSoft, color: brand.success, borderColor: brand.successBorder },
  error: { background: brand.dangerSoft, color: brand.danger, borderColor: brand.dangerBorder },
  warning: { background: brand.warningSoft, color: brand.warning, borderColor: brand.warningBorder },
  info: { background: brand.infoSoft, color: brand.info, borderColor: brand.infoBorder },
}

export function ToastProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(0)

  const showToast = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = nextId.current++
    setToasts((current) => [...current, { id, message, tone }])
    setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, 4000)
  }, [])

  const value = useMemo(() => ({ showToast }), [showToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div style={styles.stack} aria-live="polite" aria-atomic="false">
          {toasts.map((toast) => (
            <output key={toast.id} style={{ ...styles.toast, ...TONE_STYLE[toast.tone] }}>
              {toast.message}
            </output>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  // Degrada para no-op fora de um <ToastProvider> (ex.: render isolado em testes),
  // evitando quebrar telas que disparam feedback efêmero.
  return context ?? NOOP_TOAST
}

const NOOP_TOAST: ToastContextValue = { showToast: () => {} }

const styles: Record<string, CSSProperties> = {
  stack: {
    position: 'fixed',
    left: '50%',
    bottom: brand.spacing[24],
    transform: 'translateX(-50%)',
    zIndex: 60,
    display: 'flex',
    flexDirection: 'column',
    gap: `${brand.spacing[8]}px`,
    width: 'min(420px, calc(100% - 2rem))',
  },
  toast: {
    display: 'block',
    padding: `${brand.spacing[12]}px ${brand.spacing[16]}px`,
    borderRadius: brand.radius.medium,
    border: '1px solid',
    fontSize: brand.typography.bodySmall.fontSize,
    fontWeight: 500,
    boxShadow: brand.shadow,
    animation: 'gbToastIn 200ms ease',
  },
}
