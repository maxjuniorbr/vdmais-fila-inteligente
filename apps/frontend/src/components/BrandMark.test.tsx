import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BrandMark } from './BrandMark'

describe('BrandMark', () => {
  it('renders the emblem in the default (light) theme', () => {
    const { container } = render(<BrandMark />)
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('renders the on-dark variant scaled to the given size', () => {
    const { container } = render(<BrandMark onDark size={48} />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute('width')).toBe(String(48 * 0.56))
  })
})
