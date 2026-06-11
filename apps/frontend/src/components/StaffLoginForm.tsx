import { useState } from 'react'
import { Link } from 'react-router-dom'
import { saveStaffSession, StaffProfile, StaffRole } from '../auth/session'
import { brand } from '../styles/brand'
import { Alert } from './Alert'
import { BrandMark } from './BrandMark'
import { Button } from './Button'
import { Input } from './Input'

interface StaffLoginFormProps {
  title: string
  allowedRoles: StaffRole[]
  onAuthenticated: (profile: StaffProfile) => void
}

export function StaffLoginForm({
  title,
  allowedRoles,
  onAuthenticated,
}: Readonly<StaffLoginFormProps>) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(event: React.SyntheticEvent) {
    event.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const response = await fetch('/api/auth/staff-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message ?? 'Credenciais inválidas')

      const profile = data.user as StaffProfile
      if (!allowedRoles.includes(profile.role)) {
        throw new Error('Seu perfil não possui acesso a esta área')
      }

      saveStaffSession(data.access_token, profile)
      onAuthenticated(profile)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao autenticar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main style={styles.page}>
      <form onSubmit={submit} style={styles.card} aria-busy={loading}>
        <div style={styles.brandRow}>
          <BrandMark size={40} />
          <span style={styles.brandText}>VD+ Fila Inteligente</span>
        </div>
        <h1 style={styles.title}>{title}</h1>
        <Input
          label="E-mail"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <Input
          label="Senha"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          minLength={8}
          required
        />
        {error && <Alert tone="error">{error}</Alert>}
        <Button type="submit" disabled={loading} style={{ width: '100%' }}>
          {loading ? 'Entrando...' : 'Entrar'}
        </Button>
        <Link to="/" className="gb-action-link" style={styles.backLink}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M19 12H5" />
            <path d="m12 19-7-7 7-7" />
          </svg>
          Voltar ao portal da equipe
        </Link>
      </form>
    </main>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    display: 'grid',
    placeItems: 'center',
    padding: '1rem',
    background: brand.canvas,
    fontFamily: brand.font,
  },
  card: {
    width: 'min(420px, 100%)',
    background: brand.surface,
    border: `1px solid ${brand.border}`,
    borderTop: `4px solid ${brand.green700}`,
    borderRadius: 14,
    padding: '2rem 1.75rem',
    boxShadow: brand.shadow,
  },
  brandRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.6rem',
    marginBottom: '1.25rem',
  },
  brandText: {
    fontSize: '0.85rem',
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: brand.green700,
  },
  title: {
    margin: '0 0 1.25rem',
    fontSize: '1.35rem',
    color: brand.ink,
  },
  backLink: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.4rem',
    marginTop: '1.25rem',
    fontSize: '0.9rem',
    fontWeight: 600,
    color: brand.green700,
    textDecoration: 'none',
  },
}
