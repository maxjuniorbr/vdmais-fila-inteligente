/**
 * Tokens de marca — Grupo Boticário (tema white).
 * Fonte única de cores para estilos inline; espelha as variáveis de theme.css.
 */
export const brand = {
  green900: '#00301f',
  green800: '#00422c',
  green700: '#00543d',
  green600: '#056b4c',
  green500: '#0d8a5f',
  green400: '#2fae7d',
  green100: '#d3ecdf',
  green50: '#ecf7f1',

  gold600: '#a87b2d',
  gold400: '#d4a843',

  ink: '#1c2b25',
  inkSoft: '#44574e',
  inkMuted: '#5f7369',
  surface: '#ffffff',
  canvas: '#f4f9f6',
  border: '#dbe8e1',
  borderStrong: '#c2d6cb',
  borderMuted: '#94a3b8',

  danger: '#b3261e',
  dangerSoft: '#fdeceb',
  dangerBorder: '#f3c1bd',
  warning: '#8a5a00',
  warningSoft: '#fff4dd',
  warningBorder: '#f0d9a8',
  success: '#00543d',
  successSoft: '#ecf7f1',

  font: "'IBM Plex Sans', sans-serif",
  shadow: '0 1px 2px rgba(0, 48, 31, 0.06), 0 4px 16px rgba(0, 48, 31, 0.05)',

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
    display:   { fontSize: '2.4rem',  fontWeight: 800, lineHeight: 1.0  },
    heading:   { fontSize: '1.35rem', fontWeight: 700, lineHeight: 1.2  },
    title:     { fontSize: '1.25rem', fontWeight: 700, lineHeight: 1.15 },
    subtitle:  { fontSize: '1.05rem', fontWeight: 600, lineHeight: 1.3  },
    bodyLarge: { fontSize: '1rem',    fontWeight: 400, lineHeight: 1.6  },
    bodySmall: { fontSize: '0.9rem',  fontWeight: 400, lineHeight: 1.5  },
    auxiliar:  { fontSize: '0.72rem', fontWeight: 700, lineHeight: 1.4  },
  } as const,
} as const
