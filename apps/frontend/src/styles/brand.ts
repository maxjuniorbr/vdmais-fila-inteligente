export const brand = {
  surface: '#ffffff',
  canvas: '#f5f5f5',
  canvasWarm: '#f5f1eb',
  overlay: 'rgba(0, 0, 0, 0.48)',

  ink: '#222222',
  inkSoft: '#444444',
  inkMuted: '#666666',
  emphasis: '#00325f',

  border: '#e2e2e2',
  borderStrong: '#c4c4c4',
  borderMuted: '#94a3b8',
  outline: 'rgba(0, 0, 0, 0.15)',

  link: '#264fec',
  linkHover: '#002ec9',
  linkVisited: '#4c2c91',

  actionable: '#264fec',
  actionableHover: '#002ec9',
  actionableActive: '#001c76',
  actionableContent: '#ffffff',

  conversion: '#db1e8c',
  conversionHover: '#b2006a',
  conversionActive: '#750059',
  conversionContent: '#ffffff',

  nonPrimaryHover: 'rgba(38, 79, 236, 0.16)',
  nonPrimaryActive: 'rgba(38, 79, 236, 0.32)',
  nonPrimaryContent: '#264fec',

  danger: '#d32f2f',
  dangerHover: '#b71c1c',
  dangerSoft: '#ffebee',
  dangerBorder: '#f4c7c7',
  dangerContent: '#ffffff',

  success: '#1b5e20',
  successSoft: '#e8f5e9',
  successBorder: '#bfe3c2',
  warning: '#f57f17',
  warningSoft: '#fffde7',
  warningBorder: '#f5e2a8',
  info: '#0288d1',
  infoSoft: '#e1f5fe',
  infoBorder: '#bce6f5',

  disabledBg: 'rgba(0, 0, 0, 0.16)',
  disabledContent: 'rgba(0, 0, 0, 0.48)',

  keyboardFocus: '#011e38',

  font: "'IBM Plex Sans', sans-serif",
  shadow: '0 1px 2px rgba(0, 0, 0, 0.06), 0 4px 16px rgba(0, 0, 0, 0.05)',

  radius: {
    small: 4,
    medium: 8,
    large: 16,
    pill: 40,
  } as const,

  spacing: {
    4: 4,
    8: 8,
    12: 12,
    16: 16,
    20: 20,
    24: 24,
    32: 32,
    48: 48,
  } as const,

  typography: {
    display:   { fontSize: '3.25rem', fontWeight: 700, lineHeight: 1.22 },
    heading:   { fontSize: '2.25rem', fontWeight: 600, lineHeight: 1.28 },
    title:     { fontSize: '1.75rem', fontWeight: 600, lineHeight: 1.28 },
    subtitle:  { fontSize: '1.25rem', fontWeight: 500, lineHeight: 1.4  },
    bodyLarge: { fontSize: '1rem',    fontWeight: 400, lineHeight: 1.5  },
    bodySmall: { fontSize: '0.875rem', fontWeight: 400, lineHeight: 1.43 },
    auxiliar:  { fontSize: '0.75rem', fontWeight: 400, lineHeight: 1.33 },
  } as const,
} as const
