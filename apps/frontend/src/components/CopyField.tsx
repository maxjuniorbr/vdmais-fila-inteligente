import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { brand } from '../styles/brand'
import { layout } from '../styles/layout'
import { Button } from './Button'

interface CopyFieldProps {
  label: string
  value: string
  description?: string
  openLabel?: string
}

type CopyState = 'idle' | 'copied' | 'error'

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard && globalThis.isSecureContext) {
    try {
      await navigator.clipboard.writeText(value)
      return
    } catch {
      // Some browsers expose Clipboard API but block it by permission policy.
    }
  }

  const input = document.createElement('textarea')
  input.value = value
  input.setAttribute('readonly', '')
  input.style.position = 'fixed'
  input.style.opacity = '0'
  document.body.appendChild(input)

  try {
    input.select()
    // NOSONAR: document.execCommand('copy') está depreciado, mas é o único fallback
    // síncrono de cópia para contextos sem Clipboard API (HTTP/não-seguro, comum em rede local).
    const copied = document.execCommand('copy') // NOSONAR
    if (!copied) throw new Error('Falha ao copiar')
  } finally {
    input.remove()
  }
}

export function CopyField({
  label,
  value,
  description,
  openLabel = 'Abrir',
}: Readonly<CopyFieldProps>) {
  const [copyState, setCopyState] = useState<CopyState>('idle')
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current)
    },
    [],
  )

  async function copy() {
    try {
      await copyText(value)
      setCopyState('copied')
    } catch {
      setCopyState('error')
    }

    if (resetTimer.current) clearTimeout(resetTimer.current)
    resetTimer.current = setTimeout(() => setCopyState('idle'), 3000)
  }

  return (
    <article style={styles.card}>
      <div>
        <strong style={styles.label}>{label}</strong>
        {description && <p style={styles.description}>{description}</p>}
      </div>

      <input
        aria-label={`${label}: endereço`}
        className="gb-control"
        readOnly
        style={styles.value}
        value={value}
        onFocus={(event) => event.currentTarget.select()}
      />

      <div style={styles.actions}>
        <Button variant="secondary" size="sm" type="button" onClick={copy}>
          {copyState === 'copied' ? 'Copiado' : 'Copiar endereço'}
        </Button>
        <a
          className="gb-action-link"
          href={value}
          target="_blank"
          rel="noreferrer"
          style={styles.link}
        >
          {openLabel}
        </a>
      </div>

      <span aria-live="polite" style={styles.feedback}>
        {copyState === 'copied' && 'Endereço copiado para a área de transferência.'}
        {copyState === 'error' && 'Não foi possível copiar. Selecione o endereço manualmente.'}
      </span>
    </article>
  )
}

const styles: Record<string, CSSProperties> = {
  card: {
    display: 'grid',
    alignContent: 'start',
    gap: '0.8rem',
    minWidth: 0,
    padding: '1rem',
    border: `1px solid ${brand.border}`,
    borderRadius: 12,
    background: brand.surface,
  },
  label: {
    display: 'block',
    color: brand.green800,
    fontSize: '0.95rem',
  },
  description: {
    margin: '0.25rem 0 0',
    color: brand.inkMuted,
    fontSize: '0.82rem',
    lineHeight: 1.45,
  },
  value: {
    width: '100%',
    minWidth: 0,
    padding: '0.6rem 0.7rem',
    border: `1px solid ${brand.borderStrong}`,
    borderRadius: 8,
    background: brand.green50,
    color: brand.inkSoft,
    fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
    fontSize: '0.8rem',
    textOverflow: 'ellipsis',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.55rem',
    flexWrap: 'wrap',
  },
  link: {
    ...layout.ghostButton,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
    padding: '0.45rem 0.9rem',
    borderRadius: 8,
    fontSize: '0.85rem',
    textDecoration: 'none',
  },
  feedback: {
    minHeight: '1.2rem',
    color: brand.inkMuted,
    fontSize: '0.78rem',
  },
}
