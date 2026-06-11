import type { CSSProperties } from 'react'
import { brand } from '../styles/brand'

interface BrandMarkProps {
  onDark?: boolean
  size?: number
}

export function BrandMark({ onDark = false, size = 30 }: Readonly<BrandMarkProps>) {
  const emblemBg = onDark ? 'rgba(255,255,255,0.14)' : brand.green50
  const leafColor = onDark ? '#ffffff' : brand.green700

  const emblem: CSSProperties = {
    width: size,
    height: size,
    borderRadius: '32% 68% 64% 36% / 36% 36% 64% 64%',
    background: emblemBg,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  }

  return (
    <span style={styles.wrap} aria-hidden="true">
      <span style={emblem}>
        <svg
          width={size * 0.55}
          height={size * 0.55}
          viewBox="0 0 24 24"
          fill="none"
        >
          <path
            d="M12 21c-4.5-2.8-7-6.4-7-10.2C5 6.6 8 3.5 12 3c4 .5 7 3.6 7 7.8 0 3.8-2.5 7.4-7 10.2Z"
            fill={leafColor}
          />
          <path
            d="M12 6.5v12"
            stroke={onDark ? brand.green700 : '#ffffff'}
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      </span>
    </span>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    display: 'inline-flex',
    alignItems: 'center',
  },
}
