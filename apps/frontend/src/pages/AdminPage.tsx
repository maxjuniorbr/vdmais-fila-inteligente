import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { hasStaffSession, logoutStaffSession } from '../auth/session'
import { Alert } from '../components/Alert'
import { AppHeader } from '../components/AppHeader'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { CopyField } from '../components/CopyField'
import { Input } from '../components/Input'
import { Select } from '../components/Select'
import { StaffLoginForm } from '../components/StaffLoginForm'
import { brand } from '../styles/brand'
import { layout } from '../styles/layout'
import { counterStateLabel, counterStateTone, roleLabel } from '../utils/labels'

interface ERSummary {
  id: string
  name: string
  qrCodeUrl: string | null
  isDayOpen: boolean
  createdAt: string
  _count: { counters: number; operators: number }
}

interface Counter {
  id: string
  number: number
  state: string
}

interface Staff {
  id: string
  name: string
  email: string
  role: string
  createdAt: string
}

interface ERDetail extends Omit<ERSummary, '_count'> {
  counters: Counter[]
  operators: Staff[]
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(value))
}

export function AdminPage() {
  const [authenticated, setAuthenticated] = useState(() => hasStaffSession(['ADMIN']))

  if (!authenticated) {
    return (
      <StaffLoginForm
        title="Administração"
        allowedRoles={['ADMIN']}
        onAuthenticated={() => setAuthenticated(true)}
      />
    )
  }

  return <AdminDashboard onLogout={() => setAuthenticated(false)} />
}

function AdminDashboard({ onLogout }: Readonly<{ onLogout: () => void }>) {
  const navigate = useNavigate()
  const [erList, setErList] = useState<ERSummary[]>([])
  const [selectedERId, setSelectedERId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadERs = useCallback(async () => {
    try {
      setErList(await api.get<ERSummary[]>('/admin/ers'))
      setError(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar ERs')
    }
  }, [])

  useEffect(() => {
    void loadERs()
  }, [loadERs])

  async function logout() {
    await logoutStaffSession()
    onLogout()
  }

  return (
    <div style={styles.shell}>
      <AppHeader
        title="Configuração de ERs"
        subtitle="Administração"
        actions={
          <>
            <button style={layout.topbarButton} type="button" onClick={() => navigate('/')}>
              Voltar ao início
            </button>
            <button style={layout.topbarButton} type="button" onClick={() => navigate('/gestao')}>
              Gestão da fila
            </button>
          </>
        }
        onLogout={logout}
      />

      <div className="gb-page-content" style={styles.content}>
        {error && <Alert tone="error">{error}</Alert>}

        <section style={styles.card}>
          <div style={styles.sectionHeader}>
            <div>
              <h2 style={styles.cardTitle}>Cadastrar ER</h2>
              <p style={styles.sectionDescription}>
                Crie a unidade antes de configurar acessos, caixas e equipe.
              </p>
            </div>
          </div>
          <CreateERForm onCreated={loadERs} onError={setError} />
        </section>

        <section style={styles.card}>
          <div style={styles.sectionHeader}>
            <div>
              <h2 style={styles.cardTitle}>Espaços do Revendedor</h2>
              <p style={styles.sectionDescription}>
                Selecione uma unidade para acessar sua configuração operacional.
              </p>
            </div>
            <Badge>{erList.length}</Badge>
          </div>
          {erList.length === 0 && <p>Nenhum ER cadastrado ainda.</p>}
          <div className="gb-admin-er-grid">
            {erList.map((er) => (
              <article
                key={er.id}
                style={{
                  ...styles.erCard,
                  ...(selectedERId === er.id ? styles.erCardSelected : null),
                }}
              >
                <div style={styles.erCardHeader}>
                  <div>
                    <strong style={styles.erName}>{er.name}</strong>
                    <span style={styles.erDate}>Criado em {formatDate(er.createdAt)}</span>
                  </div>
                  <Badge tone={er.isDayOpen ? 'success' : 'neutral'}>
                    {er.isDayOpen ? 'Dia aberto' : 'Dia fechado'}
                  </Badge>
                </div>

                <div style={styles.erStats}>
                  <span>
                    <strong>{er._count.counters}</strong> caixas
                  </span>
                  <span>
                    <strong>{er._count.operators}</strong> contas
                  </span>
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  style={{ width: '100%' }}
                  onClick={() => setSelectedERId(selectedERId === er.id ? null : er.id)}
                >
                  {selectedERId === er.id ? 'Fechar gerenciamento' : 'Gerenciar ER'}
                </Button>
              </article>
            ))}
          </div>
        </section>

        {selectedERId && (
          <ERDetailSection
            key={selectedERId}
            erId={selectedERId}
            onChanged={loadERs}
            onClose={() => setSelectedERId(null)}
          />
        )}
      </div>
    </div>
  )
}

function CreateERForm({
  onCreated,
  onError,
}: Readonly<{
  onCreated: () => Promise<void>
  onError: (message: string | null) => void
}>) {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: React.SyntheticEvent) {
    event.preventDefault()
    setLoading(true)
    try {
      await api.post('/admin/ers', { name })
      setName('')
      onError(null)
      await onCreated()
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : 'Erro ao criar ER')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="gb-inline-form">
      <Input
        style={{ flex: 1, minWidth: 200 }}
        aria-label="Nome do ER"
        placeholder="Nome do ER"
        value={name}
        onChange={(event) => setName(event.target.value)}
        minLength={2}
        required
      />
      <Button type="submit" disabled={loading}>
        {loading ? 'Criando...' : 'Criar ER'}
      </Button>
    </form>
  )
}

function ERDetailSection({
  erId,
  onChanged,
  onClose,
}: Readonly<{
  erId: string
  onChanged: () => Promise<void>
  onClose: () => void
}>) {
  const [er, setER] = useState<ERDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const sectionRef = useRef<HTMLElement>(null)

  const load = useCallback(async () => {
    try {
      setER(await api.get<ERDetail>(`/admin/ers/${erId}`))
      setError(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar ER')
    }
  }, [erId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!er) return
    sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [er?.id])

  const refresh = useCallback(async () => {
    await load()
    await onChanged()
  }, [load, onChanged])

  if (!er) return <p>{error ?? 'Carregando...'}</p>

  const qrEntryUrl = `${globalThis.location.origin}/fila/${er.id}`
  const siteEntryUrl = `${globalThis.location.origin}/fila/${er.id}?source=link`
  const panelUrl = `${globalThis.location.origin}/painel/${er.id}`

  return (
    <section ref={sectionRef} style={styles.managementCard}>
      <div style={styles.managementHeader}>
        <div>
          <span style={styles.eyebrow}>Gerenciando ER</span>
          <h2 style={styles.managementTitle}>{er.name}</h2>
          <p style={styles.sectionDescription}>Criado em {formatDate(er.createdAt)}</p>
        </div>
        <div style={styles.managementActions}>
          <Badge tone={er.isDayOpen ? 'success' : 'neutral'}>
            {er.isDayOpen ? 'Operação aberta' : 'Operação fechada'}
          </Badge>
          <Button variant="secondary" size="sm" type="button" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <div className="gb-admin-summary-grid" style={styles.summaryGrid}>
        <SummaryItem
          label="Operação hoje"
          value={er.isDayOpen ? 'Aberta' : 'Fechada'}
          detail="Controlada pela gestora"
        />
        <SummaryItem
          label="Caixas cadastrados"
          value={er.counters.length}
          detail={er.counters.length === 1 ? 'caixa disponível' : 'caixas disponíveis'}
        />
        <SummaryItem
          label="Contas de equipe"
          value={er.operators.length}
          detail="operadoras, atendentes e gestoras"
        />
      </div>

      <section style={styles.innerSection}>
        <div style={styles.sectionHeader}>
          <div>
            <h3 style={styles.sectionTitle}>Acessos do ER</h3>
            <p style={styles.sectionDescription}>
              Use cada endereço no canal indicado para registrar corretamente a origem da entrada.
            </p>
          </div>
        </div>

        <div className="gb-admin-access-grid">
          <CopyField
            label="QR Code presencial"
            value={qrEntryUrl}
            description="Use este endereço para gerar o QR Code exposto dentro do ER."
            openLabel="Testar entrada"
          />
          <CopyField
            label="Link alternativo"
            value={siteEntryUrl}
            description="Compartilhe como alternativa ao QR Code. A RE deverá confirmar o ER."
            openLabel="Testar link"
          />
          <CopyField
            label="Painel de TV"
            value={panelUrl}
            description="Abra este endereço no navegador conectado à TV do ER."
            openLabel="Abrir painel"
          />
        </div>
      </section>

      <section style={styles.innerSection}>
        <div style={styles.sectionHeader}>
          <div>
            <h3 style={styles.sectionTitle}>Dados do ER</h3>
            <p style={styles.sectionDescription}>Identificação exibida nas telas da unidade.</p>
          </div>
        </div>
        <EditERForm er={er} onUpdated={refresh} onError={setError} />
      </section>

      <div className="gb-admin-resource-grid">
        <section style={styles.resourceSection}>
          <div style={styles.sectionHeader}>
            <div>
              <h3 style={styles.sectionTitle}>Caixas</h3>
              <p style={styles.sectionDescription}>Pontos disponíveis para atendimento.</p>
            </div>
            <Badge>{er.counters.length}</Badge>
          </div>

          {er.counters.length === 0 ? (
            <EmptyState>Nenhum caixa cadastrado.</EmptyState>
          ) : (
            <ul style={styles.compactList}>
              {er.counters.map((counter) => (
                <li key={counter.id} style={styles.compactRow}>
                  <strong>Caixa {counter.number}</strong>
                  <Badge tone={counterStateTone(counter.state)}>
                    {counterStateLabel(counter.state)}
                  </Badge>
                </li>
              ))}
            </ul>
          )}

          <div style={styles.formDivider}>
            <h4 style={styles.formTitle}>Adicionar caixa</h4>
            <CreateCounterForm erId={er.id} onCreated={refresh} onError={setError} />
          </div>
        </section>

        <section style={styles.resourceSection}>
          <div style={styles.sectionHeader}>
            <div>
              <h3 style={styles.sectionTitle}>Equipe</h3>
              <p style={styles.sectionDescription}>Contas autorizadas a operar este ER.</p>
            </div>
            <Badge>{er.operators.length}</Badge>
          </div>

          {er.operators.length === 0 ? (
            <EmptyState>Nenhuma conta cadastrada.</EmptyState>
          ) : (
            <ul style={styles.compactList}>
              {er.operators.map((staff) => (
                <li key={staff.id} style={styles.staffRow}>
                  <div style={{ minWidth: 0 }}>
                    <strong style={styles.staffName}>{staff.name}</strong>
                    <span style={styles.staffEmail}>{staff.email}</span>
                  </div>
                  <Badge>{roleLabel(staff.role)}</Badge>
                </li>
              ))}
            </ul>
          )}

          <div style={styles.formDivider}>
            <h4 style={styles.formTitle}>Criar conta</h4>
            <CreateStaffForm erId={er.id} onCreated={refresh} onError={setError} />
          </div>
        </section>
      </div>
    </section>
  )
}

function SummaryItem({
  label,
  value,
  detail,
}: Readonly<{
  label: string
  value: string | number
  detail: string
}>) {
  return (
    <article style={styles.summaryItem}>
      <span style={styles.summaryLabel}>{label}</span>
      <strong style={styles.summaryValue}>{value}</strong>
      <span style={styles.summaryDetail}>{detail}</span>
    </article>
  )
}

function EmptyState({ children }: Readonly<{ children: React.ReactNode }>) {
  return <p style={styles.emptyState}>{children}</p>
}

function EditERForm({
  er,
  onUpdated,
  onError,
}: Readonly<{
  er: ERDetail
  onUpdated: () => Promise<void>
  onError: (message: string | null) => void
}>) {
  const [name, setName] = useState(er.name)
  const [loading, setLoading] = useState(false)
  const unchanged = name.trim() === er.name

  async function submit(event: React.SyntheticEvent) {
    event.preventDefault()
    setLoading(true)
    try {
      await api.patch(`/admin/ers/${er.id}`, { name })
      onError(null)
      await onUpdated()
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : 'Erro ao atualizar ER')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="gb-inline-form">
      <Input
        label="Nome do ER"
        containerStyle={{ flex: '1 1 240px', marginBottom: 0 }}
        value={name}
        onChange={(event) => setName(event.target.value)}
        minLength={2}
        maxLength={120}
        required
      />
      <Button type="submit" disabled={loading || unchanged}>
        {loading ? 'Salvando...' : 'Salvar alteração'}
      </Button>
    </form>
  )
}

function CreateCounterForm({
  erId,
  onCreated,
  onError,
}: Readonly<{
  erId: string
  onCreated: () => Promise<void>
  onError: (message: string | null) => void
}>) {
  const [number, setNumber] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: React.SyntheticEvent) {
    event.preventDefault()
    setLoading(true)
    try {
      await api.post(`/admin/ers/${erId}/counters`, { number: Number(number) })
      setNumber('')
      onError(null)
      await onCreated()
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : 'Erro ao criar caixa')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="gb-inline-form">
      <Input
        style={{ flex: 1, minWidth: 160 }}
        type="number"
        aria-label="Número do caixa"
        placeholder="Número do caixa"
        value={number}
        onChange={(event) => setNumber(event.target.value)}
        min={1}
        max={999}
        required
      />
      <Button type="submit" disabled={loading}>
        {loading ? 'Adicionando...' : 'Adicionar caixa'}
      </Button>
    </form>
  )
}

function CreateStaffForm({
  erId,
  onCreated,
  onError,
}: Readonly<{
  erId: string
  onCreated: () => Promise<void>
  onError: (message: string | null) => void
}>) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('OPERATOR')
  const [loading, setLoading] = useState(false)

  async function submit(event: React.SyntheticEvent) {
    event.preventDefault()
    setLoading(true)
    try {
      await api.post(`/admin/ers/${erId}/staff`, { name, email, password, role })
      setName('')
      setEmail('')
      setPassword('')
      onError(null)
      await onCreated()
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : 'Erro ao criar conta')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} style={styles.stackedForm}>
      <Input
        label="Nome"
        placeholder="Nome completo"
        value={name}
        onChange={(event) => setName(event.target.value)}
        minLength={2}
        required
      />
      <Input
        label="E-mail"
        type="email"
        placeholder="email@exemplo.com"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />
      <Input
        label="Senha"
        type="password"
        placeholder="Mínimo 8 caracteres"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        minLength={8}
        required
      />
      <Select label="Perfil" value={role} onChange={(event) => setRole(event.target.value)}>
        <option value="OPERATOR">Operadora</option>
        <option value="ATTENDANT">Atendente (check-in)</option>
        <option value="MANAGER">Gestora</option>
      </Select>
      <Button type="submit" disabled={loading}>
        {loading ? 'Criando...' : 'Criar conta'}
      </Button>
    </form>
  )
}

const styles: Record<string, React.CSSProperties> = {
  ...layout,
  content: {
    maxWidth: 1180,
    margin: '0 auto',
    padding: '1.5rem 1.5rem 3rem',
  },
  cardTitle: {
    margin: 0,
    fontSize: '1.1rem',
    color: brand.green800,
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '1rem',
    marginBottom: '1rem',
  },
  sectionDescription: {
    margin: '0.25rem 0 0',
    color: brand.inkMuted,
    fontSize: '0.87rem',
    lineHeight: 1.45,
  },
  sectionTitle: {
    margin: 0,
    fontSize: '1rem',
    color: brand.green800,
  },
  erCard: {
    display: 'grid',
    gap: '1rem',
    padding: '1rem',
    border: `1px solid ${brand.border}`,
    borderRadius: 12,
    background: brand.surface,
  },
  erCardSelected: {
    borderColor: brand.green500,
    boxShadow: '0 0 0 2px rgba(13, 138, 95, 0.12)',
  },
  erCardHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '0.75rem',
  },
  erName: {
    display: 'block',
    color: brand.ink,
    fontSize: '1rem',
  },
  erDate: {
    display: 'block',
    marginTop: '0.2rem',
    color: brand.inkMuted,
    fontSize: '0.78rem',
  },
  erStats: {
    display: 'flex',
    gap: '1rem',
    padding: '0.7rem 0',
    borderTop: `1px solid ${brand.border}`,
    borderBottom: `1px solid ${brand.border}`,
    color: brand.inkMuted,
    fontSize: '0.85rem',
  },
  managementCard: {
    ...layout.card,
    scrollMarginTop: '6rem',
    padding: '1.5rem',
    borderTop: `4px solid ${brand.green600}`,
  },
  managementHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '1rem',
    paddingBottom: '1.25rem',
    borderBottom: `1px solid ${brand.border}`,
  },
  managementActions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '0.6rem',
    flexWrap: 'wrap',
  },
  eyebrow: {
    display: 'block',
    marginBottom: '0.15rem',
    color: brand.green600,
    fontSize: '0.72rem',
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
  },
  managementTitle: {
    margin: 0,
    color: brand.green900,
    fontSize: '1.45rem',
    lineHeight: 1.2,
  },
  summaryGrid: {
    margin: '1.25rem 0',
  },
  summaryItem: {
    display: 'grid',
    gap: '0.2rem',
    padding: '1rem',
    border: `1px solid ${brand.border}`,
    borderRadius: 10,
    background: brand.green50,
  },
  summaryLabel: {
    color: brand.inkMuted,
    fontSize: '0.75rem',
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  },
  summaryValue: {
    color: brand.green800,
    fontSize: '1.35rem',
    lineHeight: 1.25,
  },
  summaryDetail: {
    color: brand.inkMuted,
    fontSize: '0.8rem',
  },
  innerSection: {
    marginTop: '1rem',
    padding: '1.25rem',
    border: `1px solid ${brand.border}`,
    borderRadius: 12,
    background: brand.green50,
  },
  resourceSection: {
    minWidth: 0,
    marginTop: '1rem',
    padding: '1.25rem',
    border: `1px solid ${brand.border}`,
    borderRadius: 12,
    background: brand.surface,
  },
  compactList: {
    display: 'grid',
    gap: '0.5rem',
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  compactRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    padding: '0.7rem 0.8rem',
    border: `1px solid ${brand.border}`,
    borderRadius: 9,
    color: brand.inkSoft,
  },
  staffRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    padding: '0.7rem 0.8rem',
    border: `1px solid ${brand.border}`,
    borderRadius: 9,
  },
  staffName: {
    display: 'block',
    color: brand.inkSoft,
    fontSize: '0.9rem',
  },
  staffEmail: {
    display: 'block',
    overflow: 'hidden',
    color: brand.inkMuted,
    fontSize: '0.78rem',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  emptyState: {
    margin: 0,
    padding: '1rem',
    border: `1px dashed ${brand.borderStrong}`,
    borderRadius: 9,
    color: brand.inkMuted,
    fontSize: '0.87rem',
    textAlign: 'center',
  },
  formDivider: {
    marginTop: '1rem',
    paddingTop: '1rem',
    borderTop: `1px solid ${brand.border}`,
  },
  formTitle: {
    margin: '0 0 0.8rem',
    color: brand.green800,
    fontSize: '0.9rem',
  },
  stackedForm: {
    display: 'grid',
    gap: '0.25rem',
    maxWidth: 420,
  },
}
