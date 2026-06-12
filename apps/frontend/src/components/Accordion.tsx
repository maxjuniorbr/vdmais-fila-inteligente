import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { brand } from '../styles/brand'

interface AccordionItem {
  id: string
  title: string
  content: ReactNode
}

interface AccordionProps {
  items: AccordionItem[]
  allowMultiple?: boolean
}

export function Accordion({ items, allowMultiple = false }: Readonly<AccordionProps>) {
  const [open, setOpen] = useState<Set<string>>(new Set())

  function toggle(id: string) {
    setOpen((current) => {
      const next = new Set(allowMultiple ? current : [])
      if (current.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div style={styles.wrap}>
      {items.map((item, index) => {
        const isOpen = open.has(item.id)
        const regionId = `gb-acc-${item.id}`
        return (
          <div
            key={item.id}
            style={{
              borderBottom: index < items.length - 1 ? `1px solid ${brand.border}` : 'none',
            }}
          >
            <button
              type="button"
              id={`${regionId}-label`}
              className="gb-button"
              aria-expanded={isOpen}
              aria-controls={regionId}
              onClick={() => toggle(item.id)}
              style={styles.trigger}
            >
              <span style={styles.title}>{item.title}</span>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                aria-hidden="true"
                style={{
                  color: brand.inkMuted,
                  transform: isOpen ? 'rotate(180deg)' : 'none',
                  transition: 'transform 240ms ease',
                  flexShrink: 0,
                }}
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            <section
              id={regionId}
              aria-labelledby={`${regionId}-label`}
              hidden={!isOpen}
              style={styles.content}
            >
              {item.content}
            </section>
          </div>
        )
      })}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    background: brand.surface,
    border: `1px solid ${brand.border}`,
    borderRadius: brand.radius.medium,
    overflow: 'hidden',
  },
  trigger: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: `${brand.spacing[12]}px`,
    width: '100%',
    minHeight: 44,
    padding: `${brand.spacing[16]}px`,
    border: 'none',
    background: 'transparent',
    textAlign: 'left',
    cursor: 'pointer',
  },
  title: {
    fontSize: brand.typography.bodyLarge.fontSize,
    fontWeight: 500,
    color: brand.ink,
  },
  content: {
    padding: `0 ${brand.spacing[16]}px ${brand.spacing[16]}px`,
    fontSize: brand.typography.bodySmall.fontSize,
    color: brand.inkMuted,
    lineHeight: 1.55,
  },
}
