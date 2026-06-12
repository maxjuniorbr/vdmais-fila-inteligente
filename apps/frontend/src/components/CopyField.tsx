import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { brand } from '../styles/brand'

interface CopyFieldProps {
  label: string
  value: string
  description?: string
  helperText?: string
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

const CopyIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
)

const CheckIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
)

export function CopyField({
  label,
  value,
  description,
  helperText,
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

      <div style={styles.field}>
        <a
          href={value}
          target="_blank"
          rel="noreferrer"
          className="gb-copy-link"
          title={openLabel}
          aria-label={`${openLabel} (abre em nova aba)`}
          style={styles.link}
        >
          {value}
        </a>
        <button
          type="button"
          className="gb-icon-button"
          onClick={copy}
          aria-label={copyState === 'copied' ? 'Endereço copiado' : `Copiar ${label}`}
          style={{ ...styles.copyButton, color: copyState === 'copied' ? brand.success : brand.inkMuted }}
        >
          {copyState === 'copied' ? CheckIcon : CopyIcon}
        </button>
      </div>

      {helperText && <p style={styles.helperText}>{helperText}</p>}

      <span aria-live="polite" style={styles.feedback}>
        {copyState === 'copied' && 'Endereço copiado para a área de transferência.'}
        {copyState === 'error' && 'Não foi possível copiar. Use o link ao lado.'}
      </span>
    </article>
  )
}

const styles: Record<string, CSSProperties> = {
  card: {
    display: 'grid',
    alignContent: 'start',
    gap: `${brand.spacing[8]}px`,
    minWidth: 0,
    padding: `${brand.spacing[16]}px`,
    border: `1px solid ${brand.border}`,
    borderRadius: brand.radius.medium,
    background: brand.surface,
  },
  label: {
    display: 'block',
    color: brand.ink,
    fontSize: brand.typography.bodyLarge.fontSize,
  },
  description: {
    margin: `${brand.spacing[4]}px 0 0`,
    color: brand.inkMuted,
    fontSize: brand.typography.bodySmall.fontSize,
    lineHeight: 1.45,
  },
  field: {
    display: 'flex',
    alignItems: 'stretch',
    minWidth: 0,
    border: `1px solid ${brand.borderStrong}`,
    borderRadius: brand.radius.small,
    background: brand.surface,
  },
  link: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'center',
    padding: `${brand.spacing[8]}px ${brand.spacing[12]}px`,
    color: brand.link,
    fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
    fontSize: brand.typography.bodySmall.fontSize,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    textDecoration: 'none',
  },
  copyButton: {
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 44,
    border: 'none',
    borderLeft: `1px solid ${brand.border}`,
    borderRadius: `0 ${brand.radius.small}px ${brand.radius.small}px 0`,
    background: 'transparent',
    cursor: 'pointer',
  },
  helperText: {
    margin: 0,
    color: brand.inkMuted,
    fontSize: brand.typography.auxiliar.fontSize,
    lineHeight: 1.45,
  },
  feedback: {
    minHeight: '1.2rem',
    color: brand.inkMuted,
    fontSize: brand.typography.auxiliar.fontSize,
  },
}
