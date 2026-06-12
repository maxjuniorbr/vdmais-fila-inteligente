import { useState } from 'react'
import { hasStaffSession, logoutStaffSession } from '../auth/session'
import { Alert } from '../components/Alert'
import { AppHeader } from '../components/AppHeader'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { StaffLoginForm } from '../components/StaffLoginForm'
import { layout } from '../styles/layout'
import { brand } from '../styles/brand'

interface Representative {
  id: string
  fullName: string
  cpf: string
  phone: string
  reCode: string
}

interface Ticket {
  id: string
  code: string
  queuePosition: number
  currentPosition: number
}

const emptyRegistration = {
  fullName: '',
  cpf: '',
  phone: '',
  birthDate: '',
  reCode: '',
  password: '',
}

export function CheckinAttendantPage() {
  const [authenticated, setAuthenticated] = useState(() => hasStaffSession(['ATTENDANT']))
  const [erId, setErId] = useState(() => sessionStorage.getItem('erId') ?? '')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Representative[]>([])
  const [registration, setRegistration] = useState(emptyRegistration)
  const [showRegistration, setShowRegistration] = useState(false)
  const [selected, setSelected] = useState<Representative | null>(null)
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const token = sessionStorage.getItem('token')

  async function search(event: React.SyntheticEvent) {
    event.preventDefault()
    void fetch('/api/telemetry/manual-checkin/start', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    setError(null)
    setLoading(true)
    try {
      const response = await fetch(
        `/api/representatives/search?q=${encodeURIComponent(query.trim())}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      const data = await response.json()
      if (!response.ok) throw new Error(data.message ?? 'Erro ao buscar RE')
      setResults(data)
      if (data.length === 0) setError('Nenhuma RE encontrada.')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro na busca')
    } finally {
      setLoading(false)
    }
  }

  async function createTicket(representative: Representative) {
    setError(null)
    setLoading(true)
    try {
      const response = await fetch('/api/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          erId,
          entryChannel: 'CHECKIN_ASSISTED',
          representativeId: representative.id,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message ?? 'Erro ao fazer check-in')
      setSelected(representative)
      setTicket(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro no check-in')
    } finally {
      setLoading(false)
    }
  }

  async function registerAndCheckin(event: React.SyntheticEvent) {
    event.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const response = await fetch('/api/representatives', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(registration),
      })
      const representative = await response.json()
      if (!response.ok) {
        throw new Error(representative.message ?? 'Erro ao cadastrar RE')
      }
      await createTicket(representative)
      setRegistration(emptyRegistration)
      setShowRegistration(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro no cadastro')
      setLoading(false)
    }
  }

  function reset() {
    setQuery('')
    setResults([])
    setSelected(null)
    setTicket(null)
    setError(null)
  }

  if (!authenticated) {
    return (
      <StaffLoginForm
        title="Check-in assistido"
        allowedRoles={['ATTENDANT']}
        onAuthenticated={(profile) => {
          setErId(profile.erId ?? '')
          setAuthenticated(true)
        }}
      />
    )
  }

  if (ticket) {
    return (
      <div style={styles.shell}>
        <AppHeader
          title="Check-in assistido"
          subtitle={`ER: ${erId}`}
          onLogout={() => {
            void logoutStaffSession().then(() => setAuthenticated(false))
          }}
        />
        <main className="gb-page-content" style={styles.content}>
          <section style={{ ...styles.card, textAlign: 'center' }}>
            <h2 style={styles.successTitle}>Check-in realizado</h2>
            <p style={styles.successName}>{selected?.fullName}</p>
            <strong style={styles.code}>{ticket.code}</strong>
            <p style={styles.successPosition}>Posição #{ticket.currentPosition}</p>
            <Button variant="secondary" onClick={reset}>Novo check-in</Button>
          </section>
        </main>
      </div>
    )
  }

  return (
    <div style={styles.shell}>
      <AppHeader
        title="Check-in assistido"
        subtitle={`ER: ${erId}`}
        onLogout={() => {
          void logoutStaffSession().then(() => setAuthenticated(false))
        }}
      />
      <main className="gb-page-content" style={styles.content}>
        <section style={styles.card}>
          <form onSubmit={search} style={styles.form}>
            <Input
              label="CPF, telefone ou código RE"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              minLength={3}
              required
            />
            <Button type="submit" disabled={loading}>
              {loading ? 'Buscando...' : 'Buscar'}
            </Button>
          </form>

          {error && <Alert tone="error">{error}</Alert>}

          {results.map((representative) => (
            <article key={representative.id} style={styles.result}>
              <div style={{ minWidth: 0 }}>
                <strong>{representative.fullName}</strong>
                <div style={styles.resultMeta}>
                  {representative.cpf} - {representative.reCode}
                </div>
              </div>
              <Button size="sm" onClick={() => createTicket(representative)} disabled={loading}>
                Criar senha
              </Button>
            </article>
          ))}

          <Button variant="secondary" onClick={() => setShowRegistration((value) => !value)}>
            {showRegistration ? 'Fechar cadastro' : 'Cadastrar nova RE'}
          </Button>

          {showRegistration && (
            <form onSubmit={registerAndCheckin} style={styles.form}>
              {(
                [
                  ['fullName', 'Nome completo', 'text'],
                  ['cpf', 'CPF', 'text'],
                  ['phone', 'Telefone', 'text'],
                  ['birthDate', 'Data de nascimento', 'date'],
                  ['reCode', 'Código RE', 'text'],
                  ['password', 'Senha inicial', 'password'],
                ] as const
              ).map(([field, label, type]) => (
                <Input
                  key={field}
                  label={label}
                  type={type}
                  value={registration[field]}
                  onChange={(event) =>
                    setRegistration((current) => ({
                      ...current,
                      [field]: event.target.value,
                    }))
                  }
                  minLength={field === 'password' ? 8 : undefined}
                  required
                />
              ))}
              <Button type="submit" disabled={loading}>
                Cadastrar e criar senha
              </Button>
            </form>
          )}
        </section>
      </main>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  ...layout,
  page: layout.pageNarrow,
  content: {
    maxWidth: 720,
    margin: '0 auto',
    padding: `${brand.spacing[24]}px ${brand.spacing[24]}px ${brand.spacing[48]}px`,
  },
  form: {
    display: 'grid',
    gap: `${brand.spacing[12]}px`,
    margin: `0 0 ${brand.spacing[16]}px`,
  },
  result: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: `${brand.spacing[16]}px`,
    flexWrap: 'wrap',
    padding: `${brand.spacing[12]}px`,
    border: `1px solid ${brand.border}`,
    background: brand.canvas,
    borderRadius: brand.radius.medium,
    marginBottom: `${brand.spacing[8]}px`,
  },
  resultMeta: {
    color: brand.inkMuted,
    fontSize: brand.typography.bodySmall.fontSize,
  },
  code: {
    display: 'block',
    fontSize: 'clamp(2.5rem, 12vw, 3.5rem)',
    fontWeight: 800,
    color: brand.emphasis,
    margin: `${brand.spacing[12]}px 0`,
    letterSpacing: '0.05em',
  },
  successTitle: {
    margin: `0 0 ${brand.spacing[8]}px`,
    color: brand.ink,
  },
  successName: {
    margin: 0,
    color: brand.inkSoft,
    fontWeight: 600,
  },
  successPosition: {
    margin: `0 0 ${brand.spacing[20]}px`,
    color: brand.inkMuted,
  },
}
