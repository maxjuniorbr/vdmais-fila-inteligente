import { useCallback, useEffect, useRef, useState } from 'react'

export type ToastTone = 'success' | 'info'

export interface ToastMessage {
  text: string
  tone: ToastTone
}

/**
 * Feedback efêmero padronizado: mensagens de sucesso/informação que somem
 * sozinhas após alguns segundos. Erros continuam em `Alert` persistente.
 */
export function useToast(timeoutMs = 4000) {
  const [message, setMessage] = useState<ToastMessage | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clear = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setMessage(null)
  }, [])

  const showToast = useCallback(
    (text: string, tone: ToastTone = 'success') => {
      if (timerRef.current) clearTimeout(timerRef.current)
      setMessage({ text, tone })
      timerRef.current = setTimeout(() => setMessage(null), timeoutMs)
    },
    [timeoutMs],
  )

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return { message, showToast, clear }
}
