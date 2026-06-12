import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { logoutStaffSession } from '../auth/session'
import { useStaffSession } from '../auth/useStaffSession'
import { Alert } from '../components/Alert'
import { AppHeader } from '../components/AppHeader'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { CopyField } from '../components/CopyField'
import { Input } from '../components/Input'
import { Select } from '../components/Select'
import { StaffLoginForm } from '../components/StaffLoginForm'
import { useToast } from '../components/Toast'
import { brand } from '../styles/brand'
import { layout } from '../styles/layout'
import { formatDate } from '../utils/format'
import { counterStateLabel, counterStateTone, roleLabel } from '../utils/labels'

interface ERSummary {
  id: string
  name: string
  qrCodeUrl: string | null
  isDayOpen: boolean
  pauseTimeoutSeconds: number
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
  hasPanelToken: boolean
}

export function AdminPage() {
  const [authenticated, setAuthenticated] = useStaffSession(['ADMIN'])

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
  const { showToast } = useToast()

  async function submit(event: React.SyntheticEvent) {
    event.preventDefault()
    setLoading(true)
    try {
      await api.post('/admin/ers', { name })
      setName('')
      onError(null)
      await onCreated()
      showToast('ER criado.', 'success')
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
        </div>
      </section>

      <section style={styles.innerSection}>
        <div style={styles.sectionHeader}>
          <div>
            <h3 style={styles.sectionTitle}>Painel de TV</h3>
            <p style={styles.sectionDescription}>
              O painel só abre com um token de acesso. Gere o token, configure a URL na TV e
              revogue a qualquer momento se o endereço vazar.
            </p>
          </div>
        </div>
        <PanelAccessManager
          erId={er.id}
          panelUrl={panelUrl}
          hasPanelToken={er.hasPanelToken}
          onChanged={refresh}
          onError={setError}
        />
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
            <EmptyNote>Nenhum caixa cadastrado.</EmptyNote>
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
            <EmptyNote>Nenhuma conta cadastrada.</EmptyNote>
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

function EmptyNote({ children }: Readonly<{ children: React.ReactNode }>) {
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
  const [pauseMinutes, setPauseMinutes] = useState(String(Math.round(er.pauseTimeoutSeconds / 60)))
  const [loading, setLoading] = useState(false)
  const parsedMinutes = Number(pauseMinutes)
  const minutesValid = Number.isFinite(parsedMinutes) && parsedMinutes >= 0 && parsedMinutes <= 1440
  const nextTimeoutSeconds = Math.round(parsedMinutes * 60)
  const { showToast } = useToast()
  const unchanged =
    name.trim() === er.name && nextTimeoutSeconds === er.pauseTimeoutSeconds && minutesValid

  async function submit(event: React.SyntheticEvent) {
    event.preventDefault()
    if (!minutesValid) {
      onError('Informe um tempo de pausa entre 0 e 1440 minutos')
      return
    }
    setLoading(true)
    try {
      await api.patch(`/admin/ers/${er.id}`, { name, pauseTimeoutSeconds: nextTimeoutSeconds })
      onError(null)
      await onUpdated()
      showToast('Alterações salvas.', 'success')
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
      <Input
        label="Tempo limite de pausa (min)"
        title="Tempo que uma senha pode ficar pausada antes de ser cancelada. Use 0 para desativar."
        containerStyle={{ flex: '0 1 200px', marginBottom: 0 }}
        type="number"
        min={0}
        max={1440}
        step={1}
        value={pauseMinutes}
        onChange={(event) => setPauseMinutes(event.target.value)}
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
  const { showToast } = useToast()

  async function submit(event: React.SyntheticEvent) {
    event.preventDefault()
    setLoading(true)
    try {
      await api.post(`/admin/ers/${erId}/counters`, { number: Number(number) })
      setNumber('')
      onError(null)
      await onCreated()
      showToast('Caixa adicionado.', 'success')
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
  const { showToast } = useToast()

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
      showToast('Conta criada.', 'success')
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

function PanelAccessManager({
  erId,
  panelUrl,
  hasPanelToken,
  onChanged,
  onError,
}: Readonly<{
  erId: string
  panelUrl: string
  hasPanelToken: boolean
  onChanged: () => Promise<void>
  onError: (message: string | null) => void
}>) {
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState<'rotate' | 'revoke' | null>(null)
  const { showToast } = useToast()

  async function rotate() {
    setLoading('rotate')
    try {
      const { token } = await api.post<{ token: string }>(`/admin/ers/${erId}/panel-token`)
      setGeneratedUrl(`${panelUrl}?token=${token}`)
      onError(null)
      await onChanged()
      showToast('Token gerado. Copie agora: ele não será exibido novamente.', 'success')
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : 'Erro ao gerar token do painel')
    } finally {
      setLoading(null)
    }
  }

  async function revoke() {
    setLoading('revoke')
    try {
      await api.delete(`/admin/ers/${erId}/panel-token`)
      setGeneratedUrl(null)
      onError(null)
      await onChanged()
      showToast('Acesso do painel revogado.', 'success')
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : 'Erro ao revogar token do painel')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div style={styles.panelManager}>
      <div style={styles.panelStatusRow}>
        <Badge tone={hasPanelToken ? 'success' : 'neutral'}>
          {hasPanelToken ? 'Acesso configurado' : 'Sem acesso'}
        </Badge>
        <div style={styles.panelActions}>
          <Button
            variant="secondary"
            size="sm"
            type="button"
            onClick={rotate}
            disabled={loading !== null}
          >
            {resolveRotateLabel(loading === 'rotate', hasPanelToken)}
          </Button>
          {hasPanelToken && (
            <Button
              variant="danger"
              size="sm"
              type="button"
              onClick={revoke}
              disabled={loading !== null}
            >
              {loading === 'revoke' ? 'Revogando...' : 'Revogar acesso'}
            </Button>
          )}
        </div>
      </div>

      {generatedUrl && (
        <>
          <Alert tone="warning">
            Copie a URL agora. Por segurança, o token não será exibido novamente. Gerar um novo
            token invalida a TV configurada anteriormente.
          </Alert>
          <CopyField
            label="URL do painel com token"
            value={generatedUrl}
            description="Abra este endereço no navegador conectado à TV do ER."
            openLabel="Abrir painel"
          />
        </>
      )}

      {!generatedUrl && hasPanelToken && (
        <p style={styles.sectionDescription}>
          Um token já está ativo. Gere um novo apenas para substituir o acesso da TV; isso
          invalida o endereço anterior imediatamente.
        </p>
      )}
    </div>
  )
}

function resolveRotateLabel(isLoading: boolean, hasPanelToken: boolean): string {
  if (isLoading) return 'Gerando...'
  return hasPanelToken ? 'Gerar novo token' : 'Gerar token de acesso'
}

const styles: Record<string, React.CSSProperties> = {
  ...layout,
  content: {
    maxWidth: 1180,
    margin: '0 auto',
    padding: `${brand.spacing[24]}px ${brand.spacing[24]}px ${brand.spacing[48]}px`,
  },
  cardTitle: {
    margin: 0,
    fontSize: brand.typography.subtitle.fontSize,
    color: brand.ink,
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: `${brand.spacing[16]}px`,
    marginBottom: `${brand.spacing[16]}px`,
  },
  sectionDescription: {
    margin: `${brand.spacing[4]}px 0 0`,
    color: brand.inkMuted,
    fontSize: brand.typography.bodySmall.fontSize,
    lineHeight: 1.45,
  },
  sectionTitle: {
    margin: 0,
    fontSize: brand.typography.bodyLarge.fontSize,
    color: brand.ink,
  },
  erCard: {
    display: 'grid',
    gap: `${brand.spacing[16]}px`,
    padding: `${brand.spacing[16]}px`,
    border: `1px solid ${brand.border}`,
    borderRadius: brand.radius.large,
    background: brand.surface,
  },
  erCardSelected: {
    border: `1px solid ${brand.actionable}`,
    boxShadow: '0 0 0 2px rgba(38, 79, 236, 0.12)',
  },
  erCardHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: `${brand.spacing[12]}px`,
  },
  erName: {
    display: 'block',
    color: brand.ink,
    fontSize: brand.typography.bodyLarge.fontSize,
  },
  erDate: {
    display: 'block',
    marginTop: `${brand.spacing[4]}px`,
    color: brand.inkMuted,
    fontSize: brand.typography.auxiliar.fontSize,
  },
  erStats: {
    display: 'flex',
    gap: `${brand.spacing[16]}px`,
    padding: `${brand.spacing[12]}px 0`,
    borderTop: `1px solid ${brand.border}`,
    borderBottom: `1px solid ${brand.border}`,
    color: brand.inkMuted,
    fontSize: brand.typography.bodySmall.fontSize,
  },
  managementCard: {
    ...layout.card,
    scrollMarginTop: '6rem',
    padding: `${brand.spacing[24]}px`,
  },
  managementHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: `${brand.spacing[16]}px`,
    paddingBottom: `${brand.spacing[20]}px`,
    borderBottom: `1px solid ${brand.border}`,
  },
  managementActions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: `${brand.spacing[8]}px`,
    flexWrap: 'wrap',
  },
  eyebrow: {
    display: 'block',
    marginBottom: `${brand.spacing[4]}px`,
    color: brand.emphasis,
    fontSize: brand.typography.auxiliar.fontSize,
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
  },
  managementTitle: {
    margin: 0,
    color: brand.ink,
    fontSize: brand.typography.title.fontSize,
    lineHeight: 1.2,
  },
  summaryGrid: {
    margin: `${brand.spacing[20]}px 0`,
  },
  summaryItem: {
    display: 'grid',
    gap: `${brand.spacing[4]}px`,
    padding: `${brand.spacing[16]}px`,
    border: `1px solid ${brand.border}`,
    borderRadius: brand.radius.medium,
    background: brand.canvas,
  },
  summaryLabel: {
    color: brand.inkMuted,
    fontSize: brand.typography.auxiliar.fontSize,
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  },
  summaryValue: {
    color: brand.emphasis,
    fontSize: brand.typography.heading.fontSize,
    lineHeight: 1.25,
  },
  summaryDetail: {
    color: brand.inkMuted,
    fontSize: brand.typography.bodySmall.fontSize,
  },
  innerSection: {
    marginTop: `${brand.spacing[16]}px`,
    padding: `${brand.spacing[20]}px`,
    border: `1px solid ${brand.border}`,
    borderRadius: brand.radius.large,
    background: brand.canvas,
  },
  resourceSection: {
    minWidth: 0,
    marginTop: `${brand.spacing[16]}px`,
    padding: `${brand.spacing[20]}px`,
    border: `1px solid ${brand.border}`,
    borderRadius: brand.radius.large,
    background: brand.surface,
  },
  compactList: {
    display: 'grid',
    gap: `${brand.spacing[8]}px`,
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  compactRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: `${brand.spacing[12]}px`,
    padding: `${brand.spacing[12]}px`,
    border: `1px solid ${brand.border}`,
    borderRadius: brand.radius.medium,
    color: brand.inkSoft,
  },
  staffRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: `${brand.spacing[12]}px`,
    padding: `${brand.spacing[12]}px`,
    border: `1px solid ${brand.border}`,
    borderRadius: brand.radius.medium,
  },
  staffName: {
    display: 'block',
    color: brand.inkSoft,
    fontSize: brand.typography.bodySmall.fontSize,
  },
  staffEmail: {
    display: 'block',
    overflow: 'hidden',
    color: brand.inkMuted,
    fontSize: brand.typography.auxiliar.fontSize,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  emptyState: {
    margin: 0,
    padding: `${brand.spacing[16]}px`,
    border: `1px dashed ${brand.borderStrong}`,
    borderRadius: brand.radius.medium,
    color: brand.inkMuted,
    fontSize: brand.typography.bodySmall.fontSize,
    textAlign: 'center',
  },
  formDivider: {
    marginTop: `${brand.spacing[16]}px`,
    paddingTop: `${brand.spacing[16]}px`,
    borderTop: `1px solid ${brand.border}`,
  },
  formTitle: {
    margin: `0 0 ${brand.spacing[8]}px`,
    color: brand.ink,
    fontSize: brand.typography.bodySmall.fontSize,
  },
  stackedForm: {
    display: 'grid',
    gap: `${brand.spacing[4]}px`,
    width: '100%',
  },
  panelManager: {
    display: 'grid',
    gap: `${brand.spacing[16]}px`,
  },
  panelStatusRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: `${brand.spacing[12]}px`,
    flexWrap: 'wrap',
  },
  panelActions: {
    display: 'flex',
    alignItems: 'center',
    gap: `${brand.spacing[8]}px`,
    flexWrap: 'wrap',
  },
}
