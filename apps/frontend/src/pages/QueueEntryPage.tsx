import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { clearSession } from '../auth/session'
import { Alert } from '../components/Alert'
import { BrandMark } from '../components/BrandMark'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { layout } from '../styles/layout'
import { brand } from '../styles/brand'

type Mode = 'login' | 'register'

interface PublicER {
  id: string
  name: string
  isDayOpen: boolean
}

export function QueueEntryPage() {
  const { erId } = useParams<{ erId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isLink = searchParams.get('source') === 'link'
  const sourceQuery = isLink ? '?source=link' : ''
  const [mode, setMode] = useState<Mode>('login')
  const [er, setER] = useState<PublicER | null>(null)
  const [loadingER, setLoadingER] = useState(true)
  const [erConfirmed, setERConfirmed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [loginForm, setLoginForm] = useState({ credential: '', password: '' })
  const [registerForm, setRegisterForm] = useState({
    fullName: '',
    cpf: '',
    phone: '',
    birthDate: '',
    reCode: '',
    password: '',
  })

  useEffect(() => {
    if (!erId) {
      setError('ER não encontrado.')
      setLoadingER(false)
      return
    }

    const controller = new AbortController()
    setLoadingER(true)
    fetch(`/api/public/ers/${erId}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('ER não encontrado.')
        return response.json() as Promise<PublicER>
      })
      .then((data) => {
        setER(data)
        setError(null)
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setER(null)
        setError(err instanceof Error ? err.message : 'Erro ao validar o ER.')
      })
      .finally(() => setLoadingER(false))

    return () => controller.abort()
  }, [erId])

  useEffect(() => {
    if (!erId || sessionStorage.getItem(`queue-entry-started:${erId}`)) return
    sessionStorage.setItem(`queue-entry-started:${erId}`, '1')
    void fetch(`/api/telemetry/queue-entry/${erId}`, { method: 'POST' })
  }, [erId])

  function confirmEntry() {
    if (!erId || !er?.isDayOpen) {
      setError('A operação deste ER está encerrada.')
      return false
    }
    if (isLink && !erConfirmed) {
      setError('Confirme o ER antes de continuar.')
      return false
    }

    sessionStorage.setItem(`queue-entry:${erId}`, isLink ? 'LINK' : 'QR_CODE')
    return true
  }

  async function handleLogin(e: React.SyntheticEvent) {
    e.preventDefault()
    setError(null)
    if (!confirmEntry()) return
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...loginForm, erId }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.message ?? 'Credenciais inválidas')
      }
      const { access_token } = await res.json()
      clearSession()
      sessionStorage.setItem('token', access_token)
      navigate(`/fila/${erId}/senha${sourceQuery}`, { replace: true })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao entrar')
    } finally {
      setLoading(false)
    }
  }

  async function handleRegister(e: React.SyntheticEvent) {
    e.preventDefault()
    setError(null)
    if (!confirmEntry()) return
    setLoading(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...registerForm, erId }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.message ?? 'Erro ao cadastrar')
      }
      const { access_token } = await res.json()
      clearSession()
      sessionStorage.setItem('token', access_token)
      navigate(`/fila/${erId}/senha${sourceQuery}`, { replace: true })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao cadastrar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main style={styles.page}>
      <header style={styles.brandHeader}>
        <BrandMark size={44} />
        <div>
          <h1 style={styles.title}>Entrar na fila</h1>
          {er && <p style={styles.subtitle}>{er.name}</p>}
        </div>
      </header>

      {loadingER && (
        <output style={{ ...styles.muted, display: 'block' }}>Validando unidade...</output>
      )}

      {er && (
        <section style={styles.statusCard}>
          <span
            style={{
              ...styles.statusBadge,
              ...(er.isDayOpen ? styles.statusOpen : styles.statusClosed),
            }}
          >
            {er.isDayOpen ? 'Operação aberta' : 'Operação encerrada'}
          </span>
          {isLink && er.isDayOpen && (
            <label style={styles.confirmLabel}>
              <input
                type="checkbox"
                style={styles.checkbox}
                checked={erConfirmed}
                onChange={(event) => setERConfirmed(event.target.checked)}
              />
              <span>Confirmo que desejo entrar na fila deste ER</span>
            </label>
          )}
        </section>
      )}

      {error && <Alert tone="error">{error}</Alert>}

      <section style={styles.card}>
        <div style={styles.tabs} role="tablist" aria-label="Forma de acesso">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            className="gb-button"
            style={{ ...styles.tab, ...(mode === 'login' ? styles.tabActive : null) }}
            onClick={() => setMode('login')}
          >
            Já tenho cadastro
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'register'}
            className="gb-button"
            style={{ ...styles.tab, ...(mode === 'register' ? styles.tabActive : null) }}
            onClick={() => setMode('register')}
          >
            Criar cadastro
          </button>
        </div>

        {mode === 'login' ? (
          <form onSubmit={handleLogin} style={{ marginTop: '1.25rem' }}>
            <Input
              label="CPF ou Código RE"
              autoComplete="username"
              inputMode="numeric"
              required
              value={loginForm.credential}
              onChange={(e) => setLoginForm((f) => ({ ...f, credential: e.target.value }))}
            />
            <Input
              label="Senha"
              type="password"
              autoComplete="current-password"
              required
              value={loginForm.password}
              onChange={(e) => setLoginForm((f) => ({ ...f, password: e.target.value }))}
            />
            <Button
              type="submit"
              style={{ width: '100%' }}
              disabled={loading || loadingER || !er?.isDayOpen || (isLink && !erConfirmed)}
            >
              {loading ? 'Entrando...' : 'Entrar na fila'}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleRegister} style={{ marginTop: '1.25rem' }}>
            {(
              [
                ['fullName', 'Nome completo', 'text'],
                ['cpf', 'CPF (somente números)', 'text'],
                ['phone', 'Telefone celular (somente números)', 'text'],
                ['birthDate', 'Data de nascimento', 'date'],
                ['reCode', 'Código de RE', 'text'],
                ['password', 'Senha (mín. 8 caracteres)', 'password'],
              ] as [keyof typeof registerForm, string, string][]
            ).map(([field, label, type]) => (
              <Input
                key={field}
                label={label}
                type={type}
                required
                inputMode={field === 'cpf' || field === 'phone' ? 'numeric' : undefined}
                minLength={field === 'password' ? 8 : undefined}
                value={registerForm[field]}
                onChange={(e) => setRegisterForm((f) => ({ ...f, [field]: e.target.value }))}
              />
            ))}
            <Button
              type="submit"
              style={{ width: '100%' }}
              disabled={loading || loadingER || !er?.isDayOpen || (isLink && !erConfirmed)}
            >
              {loading ? 'Cadastrando...' : 'Criar cadastro e entrar'}
            </Button>
          </form>
        )}
      </section>
    </main>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    ...layout.pageForm,
    margin: '0 auto',
    padding: '1.5rem 1rem 3rem',
    minHeight: '100vh',
    background: brand.canvas,
  },
  brandHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.85rem',
    marginBottom: '1.25rem',
  },
  title: {
    margin: 0,
    fontSize: '1.45rem',
    color: brand.green800,
    lineHeight: 1.15,
  },
  subtitle: {
    margin: '0.15rem 0 0',
    fontSize: '0.95rem',
    color: brand.inkMuted,
  },
  muted: {
    color: brand.inkMuted,
  },
  statusCard: {
    ...layout.card,
    display: 'grid',
    gap: '0.75rem',
  },
  statusBadge: {
    justifySelf: 'start',
    padding: '0.35rem 0.8rem',
    borderRadius: 999,
    fontSize: '0.85rem',
    fontWeight: 700,
  },
  statusOpen: {
    background: brand.successSoft,
    color: brand.success,
    border: `1px solid ${brand.green100}`,
  },
  statusClosed: {
    background: brand.dangerSoft,
    color: brand.danger,
    border: `1px solid ${brand.dangerBorder}`,
  },
  confirmLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.6rem',
    fontSize: '0.95rem',
    color: brand.inkSoft,
    cursor: 'pointer',
  },
  checkbox: {
    width: 22,
    height: 22,
    accentColor: brand.green700,
    flexShrink: 0,
  },
  card: layout.card,
  tabs: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 4,
    padding: 4,
    background: brand.green50,
    borderRadius: 12,
  },
  tab: {
    padding: '0.6rem 0.5rem',
    minHeight: 44,
    border: 'none',
    borderRadius: 9,
    background: 'transparent',
    color: brand.inkSoft,
    fontWeight: 600,
    fontSize: '0.92rem',
    cursor: 'pointer',
  },
  tabActive: {
    background: brand.green700,
    color: '#ffffff',
  },
}
