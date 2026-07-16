import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  clearSession,
  getQueueEntryToken,
  markQueueEntryPending,
  saveQueueEntryChannel,
  saveQueueEntryToken,
} from '../auth/session'
import { Alert } from '../components/Alert'
import { BrandMark } from '../components/BrandMark'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { layout } from '../styles/layout'
import { brand } from '../styles/brand'
import { unlockCallAlert } from '../utils/callAlert'
import { cpfCaretPosition, formatCpfInput, isValidCpf, onlyDigits } from '../utils/cpf'
import { apiFetch } from '../api/config'

type Mode = 'login' | 'register'
const ACCESS_MODES: Mode[] = ['login', 'register']

// When guest entry is on for the ER, the guest form is the primary path and the
// account tabs move behind a secondary link; otherwise the tabs are all there is.
type View = 'guest' | 'account'

interface PublicER {
  id: string
  name: string
  isDayOpen: boolean
  entryChannel: 'QR_CODE' | 'LINK'
  guestEntryEnabled?: boolean
}

interface GuestFormState {
  firstName: string
  lastName: string
  cpf: string
}

function isLinkEntry(er: PublicER | null, sourceIsLink: boolean): boolean {
  return er ? er.entryChannel === 'LINK' : sourceIsLink
}

function isGuestFormReady(form: GuestFormState, cpfValid: boolean): boolean {
  return form.firstName.trim().length > 0 && form.lastName.trim().length > 0 && cpfValid
}

function isEntryBlocked({
  loading,
  loadingER,
  dayOpen,
  linkEntry,
  entryConfirmed,
}: Readonly<{
  loading: boolean
  loadingER: boolean
  dayOpen: boolean
  linkEntry: boolean
  entryConfirmed: boolean
}>): boolean {
  return loading || loadingER || !dayOpen || (linkEntry && !entryConfirmed)
}

function responseMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== 'object') return fallback
  const message = (data as { message?: unknown }).message
  if (Array.isArray(message)) {
    const messages = message.filter((item): item is string => typeof item === 'string')
    return messages.length > 0 ? messages.join(' ') : fallback
  }
  return typeof message === 'string' && message.length > 0 ? message : fallback
}

function GuestEntryForm({
  form,
  onField,
  cpfHelpId,
  cpfHelp,
  cpfInvalid,
  submitDisabled,
  loading,
  onSubmit,
}: Readonly<{
  form: GuestFormState
  onField: (field: keyof GuestFormState, value: string) => void
  cpfHelpId: string
  cpfHelp: string
  cpfInvalid: boolean
  submitDisabled: boolean
  loading: boolean
  onSubmit: (e: React.SyntheticEvent) => void
}>) {
  const cpfInputRef = useRef<HTMLInputElement>(null)
  const [pendingCpfCaret, setPendingCpfCaret] = useState<number | null>(null)

  useLayoutEffect(() => {
    if (pendingCpfCaret === null) return
    cpfInputRef.current?.setSelectionRange(pendingCpfCaret, pendingCpfCaret)
    setPendingCpfCaret(null)
  }, [form.cpf, pendingCpfCaret])

  return (
    <form onSubmit={onSubmit}>
      <Input
        label="Nome"
        autoComplete="given-name"
        required
        value={form.firstName}
        onChange={(e) => onField('firstName', e.target.value)}
      />
      <Input
        label="Sobrenome"
        autoComplete="family-name"
        required
        value={form.lastName}
        onChange={(e) => onField('lastName', e.target.value)}
      />
      <Input
        label="CPF"
        inputMode="numeric"
        autoComplete="off"
        required
        ref={cpfInputRef}
        aria-describedby={cpfHelpId}
        aria-invalid={cpfInvalid}
        value={form.cpf}
        onChange={(e) => {
          const caret = e.currentTarget.selectionStart ?? e.currentTarget.value.length
          const digitsBeforeCaret = onlyDigits(e.currentTarget.value.slice(0, caret)).length
          const formatted = formatCpfInput(e.currentTarget.value)
          setPendingCpfCaret(cpfCaretPosition(formatted, digitsBeforeCaret))
          onField('cpf', formatted)
        }}
      />
      <p id={cpfHelpId} style={{ ...styles.fieldHelp, ...(cpfInvalid ? styles.fieldError : null) }}>
        {cpfHelp}
      </p>
      <Button type="submit" style={{ width: '100%' }} disabled={submitDisabled}>
        {loading ? 'Entrando...' : 'Entrar na fila'}
      </Button>
    </form>
  )
}

export function QueueEntryPage() {
  const { erId } = useParams<{ erId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const sourceIsLink = searchParams.get('source') === 'link'
  const entryToken =
    new URLSearchParams(location.hash.replace(/^#/, '')).get('entry') ?? getQueueEntryToken(erId)
  const [mode, setMode] = useState<Mode>('login')
  const [view, setView] = useState<View>('account')
  const cpfHelpId = useId()
  const loginTabId = useId()
  const registerTabId = useId()
  const loginPanelId = useId()
  const registerPanelId = useId()
  const tabRefs = useRef<Record<Mode, HTMLButtonElement | null>>({
    login: null,
    register: null,
  })
  const [er, setER] = useState<PublicER | null>(null)
  const [loadingER, setLoadingER] = useState(true)
  const [erConfirmed, setERConfirmed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const isLink = isLinkEntry(er, sourceIsLink)
  const sourceQuery = isLink ? '?source=link' : ''

  const [loginForm, setLoginForm] = useState({ credential: '', password: '' })
  const [guestForm, setGuestForm] = useState({ firstName: '', lastName: '', cpf: '' })
  // Set when guest entry cannot proceed but the account flow can still help. The
  // screen offers login as an explicit next step and never auto-jumps.
  const [showAccountFallback, setShowAccountFallback] = useState(false)
  const [registerForm, setRegisterForm] = useState({
    fullName: '',
    cpf: '',
    phone: '',
    birthDate: '',
    reCode: '',
    password: '',
  })

  const guestCpfDigits = onlyDigits(guestForm.cpf)
  const guestCpfValid = guestCpfDigits.length === 11 && isValidCpf(guestForm.cpf)
  const cpfInvalid = guestCpfDigits.length === 11 && !guestCpfValid
  const guestCpfHelp = cpfInvalid
    ? 'Confira o CPF — número inválido.'
    : 'Usamos o CPF só para reconhecer você na fila.'
  const guestReady = isGuestFormReady(guestForm, guestCpfValid)
  // Shared gate for every entry form: no submit while loading, with the day closed,
  // or before a link entry is confirmed.
  const entryBlocked = isEntryBlocked({
    loading,
    loadingER,
    dayOpen: er?.isDayOpen ?? false,
    linkEntry: isLink,
    entryConfirmed: erConfirmed,
  })

  function updateGuestField(field: keyof typeof guestForm, value: string) {
    setGuestForm((f) => ({ ...f, [field]: value }))
    // Editing clears a prior guest-entry failure so the CTA/warning don't linger.
    if (showAccountFallback) setShowAccountFallback(false)
    if (error) setError(null)
  }

  useEffect(() => {
    if (!erId) {
      setError('Unidade não encontrada. Verifique o QR Code ou o link utilizados.')
      setLoadingER(false)
      return
    }

    const controller = new AbortController()
    setLoadingER(true)
    const headers = entryToken ? { 'x-entry-token': entryToken } : undefined
    const source = sourceIsLink ? '?source=link' : ''
    apiFetch(`/public/ers/${encodeURIComponent(erId)}${source}`, { signal: controller.signal, headers })
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as Partial<PublicER> & {
          message?: unknown
        }
        if (!response.ok) {
          throw new Error(
            responseMessage(
              data,
              'Unidade não encontrada. Verifique o QR Code ou o link utilizados.',
            ),
          )
        }
        return {
          ...data,
          entryChannel: data.entryChannel ?? (sourceIsLink ? 'LINK' : 'QR_CODE'),
        } as PublicER
      })
      .then((data) => {
        setER(data)
        // Guest entry, when enabled, is the primary path for this ER.
        if (data.guestEntryEnabled) setView('guest')
        if (entryToken) saveQueueEntryToken(erId, entryToken)
        setError(null)
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setER(null)
        setError(
          err instanceof Error
            ? err.message
            : 'Não foi possível carregar os dados da unidade. Tente novamente.',
        )
      })
      .finally(() => setLoadingER(false))

    return () => controller.abort()
  }, [entryToken, erId, sourceIsLink])

  function confirmEntry() {
    if (!erId || !er?.isDayOpen) {
      setError('O atendimento está encerrado no momento.')
      return false
    }
    if (isLink && !erConfirmed) {
      setError('Confirme sua entrada antes de continuar.')
      return false
    }

    saveQueueEntryChannel(erId, er.entryChannel)
    return true
  }

  function selectMode(nextMode: Mode, moveFocus = false) {
    setMode(nextMode)
    if (moveFocus) tabRefs.current[nextMode]?.focus()
  }

  function handleTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, currentMode: Mode) {
    const currentIndex = ACCESS_MODES.indexOf(currentMode)
    let nextMode: Mode | null = null

    if (event.key === 'ArrowRight') {
      nextMode = ACCESS_MODES[(currentIndex + 1) % ACCESS_MODES.length]
    } else if (event.key === 'ArrowLeft') {
      nextMode = ACCESS_MODES[(currentIndex - 1 + ACCESS_MODES.length) % ACCESS_MODES.length]
    } else if (event.key === 'Home') {
      nextMode = ACCESS_MODES[0]
    } else if (event.key === 'End') {
      nextMode = ACCESS_MODES[ACCESS_MODES.length - 1]
    }

    if (nextMode) {
      event.preventDefault()
      selectMode(nextMode, true)
    }
  }

  // Shared submit prologue. Unlocks audio inside the user gesture so the call
  // beep can play later (mobile blocks audio without a gesture). Returns false
  // when the RE hasn't confirmed the ER yet.
  function beginEntry(e: React.SyntheticEvent): boolean {
    e.preventDefault()
    setError(null)
    if (!confirmEntry()) return false
    unlockCallAlert()
    setLoading(true)
    return true
  }

  function completeEntry(accessToken: string) {
    clearSession()
    sessionStorage.setItem('token', accessToken)
    markQueueEntryPending(erId)
    navigate(`/fila/${erId}/senha${sourceQuery}`, { replace: true })
  }

  async function handleGuestEntry(e: React.SyntheticEvent) {
    if (!beginEntry(e)) return
    try {
      const res = await apiFetch('/auth/guest-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: guestForm.firstName.trim(),
          lastName: guestForm.lastName.trim(),
          cpf: onlyDigits(guestForm.cpf),
          erId,
          entryChannel: er?.entryChannel,
          ...(entryToken ? { entryToken } : {}),
        }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: unknown }
        // A registered CPF must not assume that person's identity. Warn here and
        // let her choose to go to login (the CTA), instead of yanking the screen.
        // A 403 can happen when the admin disables guest entry while this page is open.
        if (res.status === 409 || res.status === 403) setShowAccountFallback(true)
        throw new Error(responseMessage(data, 'Não foi possível entrar na fila'))
      }
      const { access_token } = await res.json()
      completeEntry(access_token)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar na fila')
    } finally {
      setLoading(false)
    }
  }

  async function handleLogin(e: React.SyntheticEvent) {
    if (!beginEntry(e)) return
    try {
      const entryContext = entryToken ? { entryToken, entryChannel: er?.entryChannel } : {}
      const res = await apiFetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...loginForm, erId, ...entryContext }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: unknown }
        throw new Error(responseMessage(data, 'Credenciais inválidas'))
      }
      const { access_token } = await res.json()
      completeEntry(access_token)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao entrar')
    } finally {
      setLoading(false)
    }
  }

  async function handleRegister(e: React.SyntheticEvent) {
    if (!beginEntry(e)) return
    try {
      const entryContext = entryToken ? { entryToken, entryChannel: er?.entryChannel } : {}
      const res = await apiFetch('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...registerForm, erId, ...entryContext }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: unknown }
        throw new Error(responseMessage(data, 'Erro ao cadastrar'))
      }
      const { access_token } = await res.json()
      completeEntry(access_token)
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
            {er.isDayOpen ? 'Atendimento aberto' : 'Atendimento encerrado'}
          </span>
          {isLink && er.isDayOpen && (
            <label style={styles.confirmLabel}>
              <input
                type="checkbox"
                style={styles.checkbox}
                checked={erConfirmed}
                onChange={(event) => setERConfirmed(event.target.checked)}
              />
              <span>Confirmo que quero entrar na fila</span>
            </label>
          )}
        </section>
      )}

      {error && <Alert tone="error">{error}</Alert>}

      {er?.guestEntryEnabled && view === 'guest' && (
        // Guest mode is CPF-only: no login is offered up front. A registered CPF is
        // the sole case that needs it — the 409 above raises the warning and this
        // CTA is the explicit path to login.
        <>
          <section style={styles.card}>
            <GuestEntryForm
              form={guestForm}
              onField={updateGuestField}
              cpfHelpId={cpfHelpId}
              cpfHelp={guestCpfHelp}
              cpfInvalid={cpfInvalid}
              submitDisabled={entryBlocked || !guestReady}
              loading={loading}
              onSubmit={handleGuestEntry}
            />
          </section>
          {showAccountFallback && (
            <button
              type="button"
              className="gb-button"
              style={styles.secondaryAction}
              onClick={() => {
                setMode('login')
                setView('account')
              }}
            >
              Entrar com meu cadastro
            </button>
          )}
        </>
      )}

      {(!er?.guestEntryEnabled || view === 'account') && (
        <>
          {er?.guestEntryEnabled && (
            <button
              type="button"
              className="gb-button"
              style={styles.secondaryAction}
              onClick={() => setView('guest')}
            >
              Entrar como convidado(a)
            </button>
          )}
          <section style={styles.card}>
            <div style={styles.tabs} role="tablist" aria-label="Forma de acesso">
              <button
                id={loginTabId}
                ref={(element) => {
                  tabRefs.current.login = element
                }}
                type="button"
                role="tab"
                aria-selected={mode === 'login'}
                aria-controls={loginPanelId}
                tabIndex={mode === 'login' ? 0 : -1}
                className="gb-button"
                style={{ ...styles.tab, ...(mode === 'login' ? styles.tabActive : null) }}
                onClick={() => selectMode('login')}
                onKeyDown={(event) => handleTabKeyDown(event, 'login')}
              >
                Já tenho cadastro
              </button>
              <button
                id={registerTabId}
                ref={(element) => {
                  tabRefs.current.register = element
                }}
                type="button"
                role="tab"
                aria-selected={mode === 'register'}
                aria-controls={registerPanelId}
                tabIndex={mode === 'register' ? 0 : -1}
                className="gb-button"
                style={{ ...styles.tab, ...(mode === 'register' ? styles.tabActive : null) }}
                onClick={() => selectMode('register')}
                onKeyDown={(event) => handleTabKeyDown(event, 'register')}
              >
                Criar cadastro
              </button>
            </div>

            <div
              id={loginPanelId}
              role="tabpanel"
              aria-labelledby={loginTabId}
              hidden={mode !== 'login'}
            >
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
                <Button type="submit" style={{ width: '100%' }} disabled={entryBlocked}>
                  {loading ? 'Entrando...' : 'Entrar na fila'}
                </Button>
              </form>
            </div>

            <div
              id={registerPanelId}
              role="tabpanel"
              aria-labelledby={registerTabId}
              hidden={mode !== 'register'}
            >
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
                <Button type="submit" style={{ width: '100%' }} disabled={entryBlocked}>
                  {loading ? 'Cadastrando...' : 'Criar cadastro e entrar'}
                </Button>
              </form>
            </div>
          </section>
        </>
      )}
    </main>
  )
}

const tabButtonBase: React.CSSProperties = {
  padding: `${brand.spacing[8]}px ${brand.spacing[4]}px`,
  minHeight: 44,
  border: 'none',
  borderRadius: brand.radius.medium,
  background: 'transparent',
  color: brand.inkSoft,
  fontWeight: brand.typography.heading.fontWeight,
  fontSize: brand.typography.bodySmall.fontSize,
  cursor: 'pointer',
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
    gap: `${brand.spacing[8]}px`,
    marginBottom: `${brand.spacing[20]}px`,
  },
  title: {
    margin: 0,
    fontSize: brand.typography.title.fontSize,
    color: brand.ink,
    lineHeight: 1.15,
  },
  subtitle: {
    margin: '0.15rem 0 0',
    fontSize: brand.typography.bodySmall.fontSize,
    color: brand.inkMuted,
  },
  muted: {
    color: brand.inkMuted,
  },
  statusCard: {
    ...layout.card,
    display: 'grid',
    gap: `${brand.spacing[12]}px`,
  },
  statusBadge: {
    justifySelf: 'start',
    padding: '0.35rem 0.8rem',
    borderRadius: 999,
    fontSize: brand.typography.bodySmall.fontSize,
    fontWeight: 700,
  },
  statusOpen: {
    background: brand.successSoft,
    color: brand.success,
    border: `1px solid ${brand.successBorder}`,
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
    accentColor: brand.actionable,
    flexShrink: 0,
  },
  card: layout.card,
  tabs: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: brand.spacing[4],
    padding: brand.spacing[4],
    background: brand.canvas,
    borderRadius: brand.radius.large,
  },
  tab: tabButtonBase,
  tabActive: {
    background: brand.actionable,
    color: brand.actionableContent,
  },
  fieldHelp: {
    ...layout.formHint,
    margin: `${brand.spacing[4]}px 0 ${brand.spacing[12]}px`,
  },
  fieldError: {
    color: brand.danger,
  },
  secondaryAction: {
    ...tabButtonBase,
    width: '100%',
    marginTop: `${brand.spacing[12]}px`,
    color: brand.actionable,
  },
}
