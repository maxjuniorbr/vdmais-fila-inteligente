import { useId, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { brand } from '../styles/brand'

export interface TabItem {
  id: string
  label: string
  content: ReactNode
}

interface TabsProps {
  tabs: TabItem[]
  /** Aba inicial. Padrão: primeira. */
  initialId?: string
  /** Rótulo acessível da lista de abas. */
  ariaLabel: string
}

/**
 * Abas para alternar conteúdo na mesma tela (padrão WAI-ARIA Tabs).
 * Teclado: ←/→ navegam, Home/End vão para a primeira/última; roving tabindex.
 */
export function Tabs({ tabs, initialId, ariaLabel }: Readonly<TabsProps>) {
  const [active, setActive] = useState(initialId ?? tabs[0]?.id)
  const baseId = useId()
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})

  function select(id: string, moveFocus = false) {
    setActive(id)
    if (moveFocus) refs.current[id]?.focus()
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, id: string) {
    const index = tabs.findIndex((tab) => tab.id === id)
    let next: TabItem | undefined
    if (event.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length]
    else if (event.key === 'ArrowLeft') next = tabs[(index - 1 + tabs.length) % tabs.length]
    else if (event.key === 'Home') next = tabs[0]
    else if (event.key === 'End') next = tabs[tabs.length - 1]
    if (next) {
      event.preventDefault()
      select(next.id, true)
    }
  }

  return (
    <div>
      <div role="tablist" aria-label={ariaLabel} style={styles.list}>
        {tabs.map((tab) => {
          const selected = tab.id === active
          return (
            <button
              key={tab.id}
              ref={(element) => {
                refs.current[tab.id] = element
              }}
              id={`${baseId}-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(tab.id)}
              onKeyDown={(event) => onKeyDown(event, tab.id)}
              style={{ ...styles.tab, ...(selected ? styles.tabActive : null) }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          id={`${baseId}-panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-${tab.id}`}
          hidden={tab.id !== active}
          tabIndex={0}
          style={styles.panel}
        >
          {tab.id === active && tab.content}
        </div>
      ))}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  list: {
    display: 'flex',
    gap: `${brand.spacing[8]}px`,
    flexWrap: 'wrap',
    borderBottom: `1px solid ${brand.border}`,
  },
  tab: {
    padding: `${brand.spacing[8]}px ${brand.spacing[4]}px`,
    minHeight: 44,
    border: 'none',
    borderBottom: '2px solid transparent',
    marginBottom: -1,
    background: 'transparent',
    color: brand.inkMuted,
    fontSize: brand.typography.bodySmall.fontSize,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'color 120ms ease, border-color 120ms ease',
  },
  tabActive: {
    color: brand.ink,
    borderBottom: `2px solid ${brand.actionable}`,
    fontWeight: 600,
  },
  panel: {
    paddingTop: `${brand.spacing[16]}px`,
  },
}
