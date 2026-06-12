import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { brand } from '../styles/brand'

export interface ActionMenuItem {
  label: string
  onClick: () => void
  tone?: 'default' | 'danger'
  disabled?: boolean
}

interface ActionMenuProps {
  items: ActionMenuItem[]
  label?: string
}

const MENU_WIDTH = 208

export function ActionMenu({ items, label = 'Abrir ações' }: Readonly<ActionMenuProps>) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const close = useCallback((restoreFocus = false) => {
    setOpen(false)
    setPosition(null)
    if (restoreFocus) buttonRef.current?.focus()
  }, [])

  function openMenu() {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    const left = Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8))
    setPosition({ top: rect.bottom + 4, left })
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const first = menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not([disabled])')
    first?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return
      close()
    }
    function onScrollOrResize() {
      close()
    }
    document.addEventListener('mousedown', onPointerDown)
    window.addEventListener('resize', onScrollOrResize)
    window.addEventListener('scroll', onScrollOrResize, true)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('resize', onScrollOrResize)
      window.removeEventListener('scroll', onScrollOrResize, true)
    }
  }, [open, close])

  function onMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const nodes = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? [],
    )
    if (nodes.length === 0) return
    const index = nodes.indexOf(document.activeElement as HTMLButtonElement)

    if (event.key === 'Escape') {
      event.preventDefault()
      close(true)
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      nodes[(index + 1) % nodes.length].focus()
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      nodes[(index - 1 + nodes.length) % nodes.length].focus()
    } else if (event.key === 'Home') {
      event.preventDefault()
      nodes[0].focus()
    } else if (event.key === 'End') {
      event.preventDefault()
      nodes[nodes.length - 1].focus()
    } else if (event.key === 'Tab') {
      close()
    }
  }

  if (items.length === 0) return null

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="gb-button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? close() : openMenu())}
        style={styles.trigger}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="12" cy="19" r="1.8" />
        </svg>
      </button>

      {open &&
        position &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            tabIndex={-1}
            aria-label={label}
            onKeyDown={onMenuKeyDown}
            style={{ ...styles.menu, top: position.top, left: position.left }}
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className="gb-menu-item"
                disabled={item.disabled}
                onClick={() => {
                  close()
                  item.onClick()
                }}
                style={{
                  ...styles.item,
                  ...(item.tone === 'danger' ? { color: brand.danger } : null),
                }}
              >
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}

const styles: Record<string, CSSProperties> = {
  trigger: {
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
  menu: {
    position: 'fixed',
    zIndex: 60,
    minWidth: MENU_WIDTH,
    padding: `${brand.spacing[4]}px`,
    background: brand.surface,
    border: `1px solid ${brand.border}`,
    borderRadius: brand.radius.medium,
    boxShadow: brand.shadow,
    animation: 'gbOverlayIn 140ms ease',
  },
  item: {
    display: 'block',
    width: '100%',
    minHeight: 44,
    padding: `${brand.spacing[8]}px ${brand.spacing[12]}px`,
    border: 'none',
    borderRadius: brand.radius.small,
    background: 'transparent',
    color: brand.ink,
    textAlign: 'left',
    fontSize: brand.typography.bodySmall.fontSize,
    cursor: 'pointer',
  },
}
