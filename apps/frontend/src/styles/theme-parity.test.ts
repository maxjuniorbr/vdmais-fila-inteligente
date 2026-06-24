import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { brand } from './brand'

// Invariante #1 do design system (apps/frontend/CLAUDE.md): brand.ts e theme.css
// nunca podem divergir — nenhum token pode existir num arquivo sem a contraparte de
// mesmo valor no outro. Este teste lê o theme.css e cruza os dois nas duas direções.
const themeCss = readFileSync(resolve(__dirname, 'theme.css'), 'utf8')

function kebab(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

// Mapa irregular dos tamanhos de fonte (bodyLarge→body-lg, bodySmall→body-sm).
const TYPO_SUFFIX: Record<string, string> = {
  display: 'display',
  heading: 'heading',
  title: 'title',
  subtitle: 'subtitle',
  bodyLarge: 'body-lg',
  bodySmall: 'body-sm',
  auxiliar: 'auxiliar',
}

function expectedTokens(): Map<string, string> {
  const out = new Map<string, string>()
  for (const [key, value] of Object.entries(brand)) {
    if (typeof value === 'string') out.set(`--gb-${kebab(key)}`, value)
  }
  for (const [key, value] of Object.entries(brand.radius)) out.set(`--gb-radius-${key}`, `${value}px`)
  for (const [key, value] of Object.entries(brand.spacing)) out.set(`--gb-spacing-${key}`, `${value}px`)
  for (const [key, value] of Object.entries(brand.typography)) {
    out.set(`--gb-font-size-${TYPO_SUFFIX[key]}`, (value as { fontSize: string }).fontSize)
  }
  return out
}

function themeTokens(): Map<string, string> {
  const start = themeCss.indexOf(':root')
  const root = themeCss.slice(start, themeCss.indexOf('}', start))
  const out = new Map<string, string>()
  for (const match of root.matchAll(/--gb-([\w-]+):\s*([^;]+);/g)) {
    out.set(`--gb-${match[1]}`, match[2].trim())
  }
  return out
}

describe('design tokens — paridade brand.ts ↔ theme.css', () => {
  const expected = expectedTokens()
  const theme = themeTokens()

  it('todo token de brand.ts tem --gb-* correspondente em theme.css com o MESMO valor', () => {
    for (const [name, value] of expected) {
      expect(theme.has(name), `theme.css não define ${name}`).toBe(true)
      expect(theme.get(name), `valor divergente em ${name}`).toBe(value)
    }
  })

  it('nenhum --gb-* existe em theme.css sem contraparte em brand.ts', () => {
    for (const name of theme.keys()) {
      expect(expected.has(name), `${name} existe em theme.css mas não em brand.ts`).toBe(true)
    }
  })
})
