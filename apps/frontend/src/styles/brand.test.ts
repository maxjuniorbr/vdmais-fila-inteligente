import { describe, expect, it } from 'vitest'
import { brand } from './brand'

function luminance(hex: string): number {
  const normalized = hex.slice(1)
  const channels = [0, 2, 4]
    .map((offset) => normalized.slice(offset, offset + 2))
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    )

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = luminance(foreground)
  const backgroundLuminance = luminance(background)
  const lighter = Math.max(foregroundLuminance, backgroundLuminance)
  const darker = Math.min(foregroundLuminance, backgroundLuminance)
  return (lighter + 0.05) / (darker + 0.05)
}

describe('brand contrast', () => {
  it.each([brand.surface, brand.canvas, brand.canvasWarm])(
    'keeps muted text at WCAG AA contrast on %s',
    (background) => {
      expect(contrastRatio(brand.inkMuted, background)).toBeGreaterThanOrEqual(4.5)
    },
  )
})
