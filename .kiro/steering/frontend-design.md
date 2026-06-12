---
inclusion: fileMatch
fileMatchPattern: 'apps/frontend/**'
---

# Frontend design system and UX guidelines

Authoritative rules for building UI in the React frontend. Token values live in
code and are the source of truth — do not restate hex/size literals here:
- Design tokens (canonical): #[[file:apps/frontend/src/styles/brand.ts]]
- CSS custom properties (mirror): #[[file:apps/frontend/src/styles/theme.css]]
- Date/time/duration formatting: #[[file:apps/frontend/src/utils/format.ts]]

## Core principles

- Semantics before appearance: choose components by the function of the
  interaction, not by looks.
- Zero hardcode: never inline fixed values for color, typography, spacing, radius,
  border or shadow. Always reference a named token.
- Parsimonious palette: surfaces are mostly neutral. Brand color is used sparingly,
  focused on conversion and primary actions.

## Tokens and source of truth

- `brand.ts` is the canonical token source (TypeScript, used in inline styles).
  `theme.css` mirrors the same values as CSS custom properties (`var(--gb-*)`)
  for CSS classes.
- Single source of truth: add a token to `brand.ts` first, then add the matching
  `--gb-*` custom property to `theme.css`. The two must never diverge; no token may
  exist in one file without its counterpart in the other.
- Never remove or rename an existing token without updating both files and every
  consumer.

## Semantic colors

- Colors are organized by intent; never mix the semantics of one category with
  another. Categories: Background, Non Interactive, Link, Conversion Button,
  Actionable, Non Primary Button, Disabled, Keyboard Focus.
- Status foundations: Success (green) for positive actions/confirmations; Error
  (red) for errors and destructive actions; Alert (amber/orange) for warnings;
  Info (blue) for contextual information.
- `Non Interactive/Outline` is exclusive to borders and dividers — never text.

## Typography

- Default font: `'IBM Plex Sans', sans-serif`, loaded via Google Fonts
  (weights 400, 600, 700, 800, 900). Token: `brand.font` / `var(--gb-font)`.
- Semantic hierarchy (values defined in `brand.typography`): Display → Heading →
  Title → Subtitle → Body Large → Body Small → Auxiliar/Restricted.
- Never hardcode `fontSize`/`fontWeight`. Use `brand.typography.*` (inline styles)
  or `--gb-font-size-*` (CSS classes).

## Layout, spacing, radius, border, shadow

- Spacing uses only the scale `{4, 8, 12, 16, 20, 24, 32, 48}`. Inline:
  `brand.spacing[N]` (produces a number; use as `` `${brand.spacing[16]}px` ``).
  CSS: `var(--gb-spacing-16)`.
- Radius by context (token / CSS var): Small — inputs, chips, tags, buttons;
  Medium — cards and containers; Large — bottom sheets and modals; Pill — pill
  elements. Use `brand.radius.*` / `var(--gb-radius-*)`, never numeric literals.
- Border thickness and shadows must come from tokens.

## Date, time and duration formatting

- Every date/time/duration display MUST use the central utility `utils/format.ts`
  (`formatDate` → `DD/MM/AAAA`, `formatTime` → `10h45`, `formatDuration` → `Xm Ys`).
- Inline formatting with `toLocaleDateString`/`toLocaleTimeString`/
  `Intl.DateTimeFormat` or ad-hoc math is prohibited (prevents divergence/duplication).

## Icons

- Outline icons by default; the active/selected state uses the filled version.
- No emojis and no external icon libraries (Material, Font Awesome, etc.).
- Icons are passed to components via props (`iconLeft`, `rightIcon`) without
  overriding internal styles.

## Component decisions

- Navigation: Navbar (global), TabBar (same screen), Breadcrumb (hierarchy).
- Actions: Primary Button (max 1 per context), Secondary/Tertiary (support),
  Conversion (commercial), Warning (destructive, requires confirmation).
- Data entry: Input (short text), Textarea (long text), Radio (exclusive, up to 5),
  Select (exclusive, more than 5), Checkbox (multiple), Switch (immediate toggle).
- Feedback: Toast (ephemeral), Alert/Banner (persistent), Skeleton (predictable
  loading), Loader (generic loading).
- Critical decisions: Modal, Bottom Sheet, Drawer.
- Accessibility: interactive controls have a minimum touch target of 44px; field
  labels are always visible (never use placeholder as label).

## Usability heuristics

- H1 Status visibility: async actions show loading and block re-click; completion
  raises a Toast or Alert; invalid fields show inline error and helper text.
- H3 Control and freedom: overlays (modals/drawers) have clear exits (close,
  cancel, clickable backdrop, swipe).
- H5 Error prevention: submit is enabled only with valid data; destructive actions
  require confirmation.
- H6 Recognition over recall: explicit labels on icons and fields; clear visual
  differentiation of selected states.
- H8 Aesthetic and minimalism: no redundant elements; use spacing strategically
  (dividers only when necessary).

## Auth and session

- `auth/session.ts` is the only module that reads/writes `sessionStorage`. Never access `sessionStorage` directly from pages or hooks.
- The JWT is the single source of truth for identity and authorization. Derive `role`, `userId`, and `erId` exclusively from `getStaffSessionProfile()`, `getStaffRole()`, and `getSessionERId()`. Never read or write raw keys like `staffRole`, `staffUserId`, or `erId` in storage.
- Route guards call `hasStaffSession(allowedRoles)`, which validates the JWT signature, role membership, and expiration in one step. Do not reimplement this check inline.
- `sessionStorage` holds only the opaque JWT (`token`) and a display-only name (`userName`). State scoped to UI context (current counter, management ER) lives in `counterId`/`managementErId` — these are UI state, not security-sensitive.

## PII display

- Never render a representative's full CPF, phone, or birth date. The API already
  returns these identifiers masked (e.g. `***.***.344-**`, `(**) *****-0000`) — display
  the masked value as-is and never reconstruct or request the full value for display.
- Show only what the operator needs to confirm identity (name + masked last digits).
  Keep success/confirmation screens minimal (ticket code, first name, position).

## Writing and tone of voice

- Pillars: gentle (empathetic, never blames the user), confident (direct, no
  hesitation), simplifying (short sentences, active voice).
- Microcopy: CTAs use infinitive verb + noun (e.g., "Salvar endereço"). Avoid
  technical jargon and raw error codes.
- Formatting: numerals as digits; dates `DD/MM/AAAA`; time with lowercase h
  (e.g., `10h45`); currency with a space (`R$ 9,90`). Implemented via `utils/format.ts`.
