/**
 * Design tokens — tema white, sistema semântico.
 * Fonte única de cores para estilos inline; espelha as variáveis de theme.css.
 *
 * Cores organizadas por intenção (nunca misturar a semântica de uma categoria
 * com outra): Background, Non Interactive, Link, Actionable, Conversion,
 * Non Primary, Warning/Destructive, Status, Disabled, Keyboard Focus.
 */
export const brand = {
  // ── Background ───────────────────────────────────────────────
  surface: '#ffffff', // background/primary
  canvas: '#f5f5f5', // background/secondary
  canvasWarm: '#f5f1eb', // background/tertiary
  overlay: 'rgba(0, 0, 0, 0.48)', // background/overlay

  // ── Non Interactive (texto) ──────────────────────────────────
  ink: '#222222', // predominant
  inkSoft: '#444444', // intermediário
  inkMuted: '#666666', // auxiliar
  emphasis: '#00325f', // ênfase institucional

  // ── Non Interactive / Outline (exclusivo de bordas e divisores) ─
  border: '#e2e2e2',
  borderStrong: '#c4c4c4',
  borderMuted: '#94a3b8',
  outline: 'rgba(0, 0, 0, 0.15)',

  // ── Link ─────────────────────────────────────────────────────
  link: '#264fec',
  linkHover: '#002ec9',
  linkVisited: '#4c2c91',

  // ── Actionable (ação primária) ───────────────────────────────
  actionable: '#264fec',
  actionableHover: '#002ec9',
  actionableActive: '#001c76',
  actionableContent: '#ffffff',

  // ── Conversion (comercial / destaque) ────────────────────────
  conversion: '#db1e8c',
  conversionHover: '#b2006a',
  conversionActive: '#750059',
  conversionContent: '#ffffff',

  // ── Non Primary (botão secundário/terciário sobre actionable) ─
  nonPrimaryHover: 'rgba(38, 79, 236, 0.16)',
  nonPrimaryActive: 'rgba(38, 79, 236, 0.32)',
  nonPrimaryContent: '#264fec',

  // ── Warning / Destructive ────────────────────────────────────
  danger: '#d32f2f',
  dangerHover: '#b71c1c',
  dangerSoft: '#ffebee',
  dangerBorder: '#f4c7c7',
  dangerContent: '#ffffff',

  // ── Status (foundations) ─────────────────────────────────────
  success: '#1b5e20',
  successSoft: '#e8f5e9',
  successBorder: '#bfe3c2',
  warning: '#f57f17', // alerta (âmbar)
  warningSoft: '#fffde7',
  warningBorder: '#f5e2a8',
  info: '#0288d1',
  infoSoft: '#e1f5fe',
  infoBorder: '#bce6f5',

  // ── Disabled ─────────────────────────────────────────────────
  disabledBg: 'rgba(0, 0, 0, 0.16)',
  disabledContent: 'rgba(0, 0, 0, 0.48)',

  // ── Keyboard Focus ───────────────────────────────────────────
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
