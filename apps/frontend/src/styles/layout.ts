import type { CSSProperties } from 'react'
import { brand } from './brand'

/**
 * Shared layout tokens — tema white Grupo Boticário (verde institucional).
 * All staff-facing pages spread from this object and override only what differs.
 */
export const layout: Record<string, CSSProperties> = {
  // App shell — full-height canvas behind every staff page
  shell: {
    minHeight: '100vh',
    background: brand.canvas,
    fontFamily: brand.font,
    color: brand.ink,
  },

  // Full-width sticky top bar (shared across staff screens)
  topbar: {
    position: 'sticky',
    top: 0,
    zIndex: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1rem',
    padding: '0.9rem 2rem',
    background: brand.green700,
    borderBottom: `3px solid ${brand.gold400}`,
    color: '#ffffff',
  },
  topbarTitle: {
    margin: 0,
    fontSize: '1.25rem',
    fontWeight: 700,
    color: '#ffffff',
    lineHeight: 1.15,
  },
  topbarSubtitle: {
    fontSize: '0.8rem',
    color: brand.green100,
    letterSpacing: '0.02em',
  },
  topbarButton: {
    padding: '0.55rem 1.1rem',
    minHeight: 44,
    border: '1px solid rgba(255, 255, 255, 0.45)',
    borderRadius: 10,
    background: 'transparent',
    color: '#ffffff',
    fontWeight: 600,
    fontSize: '0.9rem',
    cursor: 'pointer',
  },

  // Page wrappers
  page: {
    maxWidth: 1100,
    margin: '2rem auto',
    padding: '0 1rem',
    fontFamily: brand.font,
  },
  pageNarrow: {
    maxWidth: 720,
    margin: '2rem auto',
    padding: '0 1rem',
    fontFamily: brand.font,
  },
  pageForm: {
    maxWidth: 460,
    margin: '2rem auto',
    padding: '0 1rem',
    fontFamily: brand.font,
  },

  // Header bar
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem',
  },

  // Action button rows
  actions: {
    display: 'flex',
    gap: '0.5rem',
    flexWrap: 'wrap',
  },

  // Section card
  card: {
    background: brand.surface,
    border: `1px solid ${brand.border}`,
    borderRadius: 12,
    padding: '1.25rem',
    marginBottom: '1rem',
    boxShadow: brand.shadow,
  },

  // Elevated section card (new operation layout)
  panel: {
    position: 'relative',
    background: brand.surface,
    border: `1px solid ${brand.border}`,
    borderRadius: 14,
    padding: '1.4rem 1.5rem',
    boxShadow: brand.shadow,
  },

  // Small uppercase section label with leading status dot
  sectionLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    margin: '0 0 1rem',
    fontSize: '0.72rem',
    fontWeight: 700,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: brand.inkMuted,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: brand.borderStrong,
    flexShrink: 0,
  },

  // Count badge (top-right of a panel)
  countBadge: {
    minWidth: 24,
    height: 24,
    padding: '0 0.45rem',
    borderRadius: 12,
    background: brand.green50,
    border: `1px solid ${brand.green100}`,
    color: brand.green700,
    fontSize: '0.8rem',
    fontWeight: 700,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Status chip / pill
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.4rem',
    padding: '0.4rem 0.7rem',
    borderRadius: 999,
    background: brand.green50,
    border: `1px solid ${brand.border}`,
    fontSize: '0.85rem',
    color: brand.inkSoft,
  },
  chipState: {
    fontSize: '0.7rem',
    fontWeight: 600,
    letterSpacing: '0.06em',
    color: brand.inkMuted,
    textTransform: 'uppercase',
  },

  // List row inside a panel
  panelRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.6rem',
    padding: '0.6rem 0.75rem',
    borderRadius: 8,
    background: brand.green50,
    border: `1px solid ${brand.border}`,
    fontSize: '0.92rem',
    color: brand.inkSoft,
  },

  // Primary action button — verde institucional
  primaryButton: {
    padding: '0.7rem 1.4rem',
    minHeight: 44,
    border: 'none',
    borderRadius: 10,
    background: brand.green700,
    color: '#ffffff',
    fontWeight: 600,
    fontSize: '0.95rem',
    cursor: 'pointer',
  },

  // Secondary / ghost button (outline)
  ghostButton: {
    padding: '0.7rem 1.4rem',
    minHeight: 44,
    border: `1px solid ${brand.green600}`,
    borderRadius: 10,
    background: brand.surface,
    color: brand.green700,
    fontWeight: 600,
    fontSize: '0.95rem',
    cursor: 'pointer',
  },

  // Destructive button (outline, red accent)
  dangerButton: {
    padding: '0.7rem 1.4rem',
    minHeight: 44,
    border: `1px solid ${brand.dangerBorder}`,
    borderRadius: 10,
    background: brand.surface,
    color: brand.danger,
    fontWeight: 600,
    fontSize: '0.95rem',
    cursor: 'pointer',
  },

  // Form label wrapper
  formLabel: {
    display: 'grid',
    gap: '0.35rem',
    marginBottom: '1rem',
    fontSize: '0.9rem',
    fontWeight: 600,
    color: brand.inkSoft,
  },

  // Form text input
  formInput: {
    padding: '0.65rem 0.75rem',
    minHeight: 44,
    border: `1px solid ${brand.borderStrong}`,
    borderRadius: 10,
    width: '100%',
    boxSizing: 'border-box',
    fontSize: '1rem',
    fontWeight: 400,
    color: brand.ink,
    background: brand.surface,
  },

  // Inline error box
  error: {
    padding: '0.75rem 0.9rem',
    borderRadius: 10,
    color: brand.danger,
    background: brand.dangerSoft,
    border: `1px solid ${brand.dangerBorder}`,
    marginBottom: '1rem',
    fontWeight: 500,
  },

  // Confirmation modal card
  modal: {
    display: 'grid',
    gap: '0.75rem',
    width: 'min(420px, 100%)',
    padding: '1.5rem',
    borderRadius: 14,
    background: brand.surface,
    boxShadow: brand.shadow,
  },
}
