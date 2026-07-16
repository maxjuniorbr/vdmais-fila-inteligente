import { useState } from 'react'
import type { CSSProperties } from 'react'
import { AppHeader } from '../components/AppHeader'
import { ActionMenu } from '../components/ActionMenu'
import { Accordion } from '../components/Accordion'
import { Alert } from '../components/Alert'
import { Badge } from '../components/Badge'
import { BarList } from '../components/BarList'
import { BottomSheet } from '../components/BottomSheet'
import { BrandMark } from '../components/BrandMark'
import { Button } from '../components/Button'
import { Choice } from '../components/Choice'
import { CopyField } from '../components/CopyField'
import { Drawer } from '../components/Drawer'
import { EmptyState } from '../components/EmptyState'
import { Input } from '../components/Input'
import { MetricCard } from '../components/MetricCard'
import { Modal } from '../components/Modal'
import { SectionPanel } from '../components/SectionPanel'
import { Select } from '../components/Select'
import { Skeleton } from '../components/Skeleton'
import { Spinner } from '../components/Spinner'
import { StatusDot } from '../components/StatusDot'
import { Stepper } from '../components/Stepper'
import { Switch } from '../components/Switch'
import { Table, type Column } from '../components/Table'
import { Tabs } from '../components/Tabs'
import { Textarea } from '../components/Textarea'
import { ToastProvider, useToast } from '../components/Toast'
import { brand } from '../styles/brand'
import { layout } from '../styles/layout'

type Tab = 'componentes' | 'formulario' | 'estados' | 'interacoes'
type DataState = 'ideal' | 'carregando' | 'vazio'
const DATA_STATE_LABEL: Record<DataState, string> = {
  ideal: 'Ideal',
  carregando: 'Carregando',
  vazio: 'Vazio',
}
type Overlay = null | 'modal' | 'sheet' | 'drawer'

const TABS: { id: Tab; label: string }[] = [
  { id: 'componentes', label: '1. Componentes' },
  { id: 'formulario', label: '2. Formulário' },
  { id: 'estados', label: '3. Estados' },
  { id: 'interacoes', label: '4. Interações' },
]

const InboxIcon = (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 12h-6l-2 3h-4l-2-3H2" />
    <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" />
  </svg>
)

interface SampleOrder {
  id: string
  code: string
  date: string
  status: string
  tone: 'success' | 'info' | 'warning'
  value: string
}

const SAMPLE_ORDERS: SampleOrder[] = [
  { id: '1', code: '#PED-8812', date: '10/11/2026', status: 'Entregue', tone: 'success', value: 'R$ 345,90' },
  { id: '2', code: '#PED-8813', date: '12/11/2026', status: 'Em separação', tone: 'info', value: 'R$ 1.120,00' },
  { id: '3', code: '#PED-8814', date: '14/11/2026', status: 'Pendente', tone: 'warning', value: 'R$ 89,90' },
]

const ORDER_COLUMNS: Column<SampleOrder>[] = [
  { key: 'code', header: 'Código', render: (order) => order.code },
  { key: 'date', header: 'Data', render: (order) => order.date },
  { key: 'status', header: 'Status', render: (order) => <Badge tone={order.tone}>{order.status}</Badge> },
  { key: 'value', header: 'Valor', align: 'right', render: (order) => order.value },
]

function Section({ title, children }: Readonly<{ title: string; children: React.ReactNode }>) {
  return (
    <section style={layout.card}>
      <h2 style={styles.sectionTitle}>{title}</h2>
      {children}
    </section>
  )
}

function PlaygroundInner() {
  const { showToast } = useToast()
  const [tab, setTab] = useState<Tab>('componentes')
  const [dataState, setDataState] = useState<DataState>('ideal')
  const [overlay, setOverlay] = useState<Overlay>(null)
  const [syncing, setSyncing] = useState(false)
  const [notify, setNotify] = useState(true)

  function simulateSync() {
    setSyncing(true)
    setTimeout(() => {
      setSyncing(false)
      showToast('Base atualizada com sucesso.', 'success')
    }, 1400)
  }

  const orderColumns: Column<SampleOrder>[] = [
    ...ORDER_COLUMNS,
    {
      key: 'actions',
      header: 'Ações',
      align: 'right',
      render: (order) => (
        <ActionMenu
          label={`Ações do pedido ${order.code}`}
          items={[
            { label: 'Ver detalhes', onClick: () => showToast(`Detalhes de ${order.code}.`, 'info') },
            {
              label: 'Cancelar pedido',
              tone: 'danger',
              onClick: () => showToast('Pedido cancelado.', 'success'),
            },
          ]}
        />
      ),
    },
  ]

  return (
    <div style={layout.shell}>
      <AppHeader
        title="Design Playground"
        subtitle="Galeria de componentes, fluxos e estados"
        actions={
          <Button variant="conversion" onClick={simulateSync} disabled={syncing}>
            {syncing ? 'Atualizando...' : 'Atualizar base'}
          </Button>
        }
      />

      <main style={layout.page}>
        <nav style={styles.tabs} aria-label="Seções do playground">
          {TABS.map((item) => {
            const selected = tab === item.id
            return (
              <button
                key={item.id}
                type="button"
                className="gb-button"
                onClick={() => setTab(item.id)}
                style={{ ...styles.tab, ...(selected ? styles.tabActive : null) }}
              >
                {item.label}
              </button>
            )
          })}
        </nav>

        {syncing ? (
          <div aria-busy="true" style={styles.stack}>
            <div style={styles.grid}>
              {[0, 1, 2].map((index) => (
                <div key={index} style={layout.card}>
                  <Skeleton width="60%" height={12} />
                  <Skeleton height={28} style={{ marginTop: brand.spacing[12] }} />
                  <Skeleton width="40%" height={12} style={{ marginTop: brand.spacing[12] }} />
                </div>
              ))}
            </div>
            <Skeleton height={220} />
          </div>
        ) : (
          <>
        {tab === 'componentes' && (
          <>
            <Section title="Botões">
              <div style={styles.row}>
                <Button variant="primary">Ação primária</Button>
                <Button variant="secondary">Secundário</Button>
                <Button variant="conversion">Comprar agora</Button>
                <Button variant="danger">Excluir</Button>
                <Button variant="primary" disabled>
                  Desabilitado
                </Button>
              </div>
            </Section>

            <Section title="Selos e métricas">
              <div style={styles.row}>
                <Badge>12</Badge>
                <Badge tone="success">Entregue</Badge>
                <Badge tone="warning">Pendente</Badge>
              </div>
              <div style={{ ...styles.grid, marginTop: brand.spacing[16] }}>
                <MetricCard label="Senhas atendidas" value={28} />
                <MetricCard label="Tempo médio" value="4m 12s" />
                <MetricCard label="Em espera" value={6} />
              </div>
            </Section>

            <Section title="Marca e indicadores de estado">
              <div style={styles.row}>
                <BrandMark />
                <span style={styles.brandWord}>VD+ Fila Inteligente</span>
              </div>
              <div style={{ ...styles.stack, marginTop: brand.spacing[16] }}>
                <span style={styles.statusLine}>
                  <StatusDot color={brand.success} /> Caixa ativo
                </span>
                <span style={styles.statusLine}>
                  <StatusDot color={brand.warning} /> Chamando senha
                </span>
                <span style={styles.statusLine}>
                  <StatusDot /> Aguardando início
                </span>
              </div>
            </Section>

            <Section title="Painel de seção (SectionPanel)">
              <SectionPanel label="Senhas em espera" dotColor={brand.warning} count={6}>
                <p style={styles.tabText}>Pessoas aguardando chamada no espaço selecionado.</p>
              </SectionPanel>
            </Section>

            <Section title="Endereço copiável (CopyField)">
              <CopyField
                label="Link público da fila"
                value="https://fila.vdmais.com/fila/er-osasco"
                description="Compartilhe com a recepção do espaço."
                helperText="O QR Code aponta para este mesmo endereço."
              />
            </Section>

            <Section title="Avisos persistentes (Alert)">
              <div style={styles.stack}>
                <Alert tone="info">Conexão restabelecida com a base de dados.</Alert>
                <Alert tone="success">Preferências salvas.</Alert>
                <Alert tone="warning">Alguns dados podem estar desatualizados.</Alert>
                <Alert tone="error">Não foi possível concluir a operação.</Alert>
              </div>
            </Section>

            <Section title="Controles">
              <div style={styles.stack}>
                <Switch
                  label="Notificações por SMS"
                  checked={notify}
                  onChange={(event) => {
                    setNotify(event.target.checked)
                    showToast('Preferência atualizada.', 'success')
                  }}
                />
                <Choice control="checkbox" defaultChecked>
                  Tornar este o endereço principal
                </Choice>
                <div style={styles.row}>
                  <Choice control="radio" name="pg-res" defaultChecked>
                    Casa
                  </Choice>
                  <Choice control="radio" name="pg-res">
                    Apartamento
                  </Choice>
                </div>
                <Spinner />
              </div>
            </Section>

            <Section title="Tabela">
              <Table
                columns={orderColumns}
                rows={SAMPLE_ORDERS}
                getRowKey={(order) => order.id}
                caption="Últimos pedidos"
                emptyMessage="Nenhum pedido encontrado."
              />
            </Section>

            <Section title="Distribuição (BarList)">
              <BarList
                items={[
                  { label: '08h', value: 4 },
                  { label: '09h', value: 9 },
                  { label: '10h', value: 15, highlight: true },
                  { label: '11h', value: 12, highlight: true },
                  { label: '12h', value: 6 },
                ]}
              />
            </Section>

            <Section title="Abas (Tabs)">
              <Tabs
                ariaLabel="Exemplo de abas"
                tabs={[
                  {
                    id: 'visao',
                    label: 'Visão geral',
                    content: <p style={styles.tabText}>Resumo do dia e principais indicadores.</p>,
                  },
                  {
                    id: 'detalhes',
                    label: 'Detalhes',
                    content: <p style={styles.tabText}>Quebra por canal, caixa e operador(a).</p>,
                  },
                  {
                    id: 'historico',
                    label: 'Histórico',
                    content: <p style={styles.tabText}>Nenhum registro anterior disponível.</p>,
                  },
                ]}
              />
            </Section>
          </>
        )}

        {tab === 'formulario' && (
          <Section title="Endereço de entrega">
            <div style={{ marginBottom: brand.spacing[32] }}>
              <Stepper steps={['Dados', 'Endereço', 'Revisão']} current={1} />
            </div>
            <div style={styles.formGrid}>
              <Input
                label="CEP"
                defaultValue="13031-50"
                inputMode="numeric"
                maxLength={9}
                aria-invalid
                style={{ border: `1px solid ${brand.danger}`, background: brand.dangerSoft }}
              />
              <Select label="Estado" defaultValue="">
                <option value="" disabled>
                  Selecione
                </option>
                <option value="SP">São Paulo</option>
                <option value="PR">Paraná</option>
              </Select>
            </div>
            <p style={styles.fieldError}>O CEP deve conter 8 dígitos.</p>
            <Input label="Cidade" placeholder="Nome da cidade" containerStyle={{ marginTop: brand.spacing[16] }} />
            <Textarea
              label="Complemento (opcional)"
              placeholder="Ex.: próximo ao mercado, portão azul"
              containerStyle={{ marginTop: brand.spacing[16] }}
            />
            <div style={{ ...styles.row, marginTop: brand.spacing[24], justifyContent: 'flex-end' }}>
              <Button variant="secondary">Voltar</Button>
              <Button variant="primary" onClick={() => showToast('Endereço salvo.', 'success')}>
                Salvar endereço
              </Button>
            </div>
          </Section>
        )}

        {tab === 'estados' && (
          <>
            <nav style={styles.segmented} aria-label="Alternar estado">
              {(['ideal', 'carregando', 'vazio'] as DataState[]).map((state) => (
                <button
                  key={state}
                  type="button"
                  className="gb-button"
                  onClick={() => setDataState(state)}
                  style={{
                    ...styles.segment,
                    ...(dataState === state ? styles.segmentActive : null),
                  }}
                >
                  {DATA_STATE_LABEL[state]}
                </button>
              ))}
            </nav>

            {dataState === 'ideal' && (
              <div style={styles.grid}>
                <MetricCard label="Ciclo atual" value="R$ 4.250,00" />
                <MetricCard label="Pedidos" value={28} />
                <MetricCard label="Lucro estimado" value="R$ 1.275,00" />
              </div>
            )}

            {dataState === 'carregando' && (
              <div style={styles.grid} aria-busy="true">
                {[0, 1, 2].map((index) => (
                  <div key={index} style={layout.card}>
                    <Skeleton width="60%" height={12} />
                    <Skeleton height={28} style={{ marginTop: brand.spacing[12] }} />
                    <Skeleton width="40%" height={12} style={{ marginTop: brand.spacing[12] }} />
                  </div>
                ))}
              </div>
            )}

            {dataState === 'vazio' && (
              <EmptyState
                icon={InboxIcon}
                title="Nenhum dado encontrado"
                description="Não há registros para exibir neste momento."
                action={
                  <Button variant="secondary" onClick={() => setDataState('ideal')}>
                    Recarregar tela
                  </Button>
                }
              />
            )}
          </>
        )}

        {tab === 'interacoes' && (
          <>
            <Section title="Lista expansível (Accordion)">
              <Accordion
                items={[
                  {
                    id: 'troca',
                    title: 'Como funciona a chamada de senha?',
                    content:
                      'A senha aparece no painel e o sistema avisa quando é a vez da pessoa. Caso ausente, a senha pode ser remarcada como não comparecimento.',
                  },
                  {
                    id: 'prazos',
                    title: 'Tempo médio de espera',
                    content:
                      'O tempo médio é calculado com base nos atendimentos recentes do espaço selecionado.',
                  },
                ]}
              />
            </Section>

            <Section title="Sobreposições e diálogos">
              <div style={styles.stack}>
                <div style={styles.interactionRow}>
                  <div>
                    <p style={styles.interactionTitle}>Modal destrutivo</p>
                    <p style={styles.interactionHint}>Exige confirmação e bloqueia a tela</p>
                  </div>
                  <Button variant="danger" onClick={() => setOverlay('modal')}>
                    Excluir conta
                  </Button>
                </div>
                <div style={styles.interactionRow}>
                  <div>
                    <p style={styles.interactionTitle}>Bottom sheet</p>
                    <p style={styles.interactionHint}>Ancora na base, ideal para menus</p>
                  </div>
                  <Button variant="secondary" onClick={() => setOverlay('sheet')}>
                    Abrir opções
                  </Button>
                </div>
                <div style={styles.interactionRow}>
                  <div>
                    <p style={styles.interactionTitle}>Drawer lateral</p>
                    <p style={styles.interactionHint}>Navegação ancorada à esquerda</p>
                  </div>
                  <Button variant="secondary" onClick={() => setOverlay('drawer')}>
                    Abrir menu
                  </Button>
                </div>
                <div style={styles.interactionRow}>
                  <div>
                    <p style={styles.interactionTitle}>Feedback (Toasts)</p>
                    <p style={styles.interactionHint}>Avisos temporários do sistema</p>
                  </div>
                  <div style={styles.row}>
                    <Button variant="secondary" size="sm" onClick={() => showToast('Ação concluída.', 'success')}>
                      Sucesso
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => showToast('Falha na comunicação.', 'error')}>
                      Erro
                    </Button>
                  </div>
                </div>
              </div>
            </Section>
          </>
        )}
          </>
        )}
      </main>

      {overlay === 'modal' && (
        <Modal
          title="Excluir conta permanentemente?"
          onClose={() => setOverlay(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setOverlay(null)}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  setOverlay(null)
                  showToast('Conta excluída.', 'success')
                }}
              >
                Sim, excluir
              </Button>
            </>
          }
        >
          Esta ação remove todos os dados e não pode ser desfeita.
        </Modal>
      )}

      {overlay === 'sheet' && (
        <BottomSheet title="Opções rápidas" onClose={() => setOverlay(null)}>
          <div style={styles.stack}>
            <Button variant="secondary" onClick={() => setOverlay(null)}>
              Compartilhar
            </Button>
            <Button variant="secondary" onClick={() => setOverlay(null)}>
              Baixar comprovante
            </Button>
          </div>
        </BottomSheet>
      )}

      {overlay === 'drawer' && (
        <Drawer title="Menu" onClose={() => setOverlay(null)}>
          <a href="#inicio" style={styles.drawerLink} onClick={() => setOverlay(null)}>
            Início
          </a>
          <a href="#fila" style={styles.drawerLink} onClick={() => setOverlay(null)}>
            Fila
          </a>
          <a href="#conta" style={styles.drawerLink} onClick={() => setOverlay(null)}>
            Minha conta
          </a>
        </Drawer>
      )}
    </div>
  )
}

export function PlaygroundPage() {
  return (
    <ToastProvider>
      <PlaygroundInner />
    </ToastProvider>
  )
}

const styles: Record<string, CSSProperties> = {
  tabs: {
    display: 'flex',
    gap: `${brand.spacing[8]}px`,
    flexWrap: 'wrap',
    marginBottom: `${brand.spacing[24]}px`,
    paddingBottom: `${brand.spacing[8]}px`,
    borderBottom: `1px solid ${brand.border}`,
  },
  tab: {
    padding: `${brand.spacing[8]}px ${brand.spacing[16]}px`,
    minHeight: 44,
    border: 'none',
    borderRadius: brand.radius.pill,
    background: 'transparent',
    color: brand.inkMuted,
    fontWeight: 600,
    fontSize: brand.typography.bodySmall.fontSize,
    cursor: 'pointer',
  },
  tabActive: {
    background: brand.actionable,
    color: brand.actionableContent,
  },
  sectionTitle: {
    margin: `0 0 ${brand.spacing[16]}px`,
    fontSize: brand.typography.subtitle.fontSize,
    fontWeight: 600,
    color: brand.ink,
  },
  row: {
    display: 'flex',
    gap: `${brand.spacing[12]}px`,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: `${brand.spacing[12]}px`,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: `${brand.spacing[16]}px`,
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: `${brand.spacing[16]}px`,
  },
  fieldError: {
    margin: `${brand.spacing[4]}px 0 0`,
    color: brand.danger,
    fontSize: brand.typography.auxiliar.fontSize,
  },
  segmented: {
    display: 'inline-flex',
    gap: `${brand.spacing[4]}px`,
    padding: `${brand.spacing[4]}px`,
    marginBottom: `${brand.spacing[24]}px`,
    background: brand.canvas,
    borderRadius: brand.radius.pill,
  },
  segment: {
    minHeight: 40,
    padding: `${brand.spacing[8]}px ${brand.spacing[20]}px`,
    border: 'none',
    borderRadius: brand.radius.pill,
    background: 'transparent',
    color: brand.inkSoft,
    fontWeight: 600,
    fontSize: brand.typography.bodySmall.fontSize,
    cursor: 'pointer',
  },
  segmentActive: {
    background: brand.surface,
    color: brand.ink,
    boxShadow: brand.shadow,
  },
  interactionRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: `${brand.spacing[16]}px`,
    flexWrap: 'wrap',
    padding: `${brand.spacing[16]}px`,
    background: brand.surface,
    border: `1px solid ${brand.border}`,
    borderRadius: brand.radius.medium,
  },
  interactionTitle: {
    margin: 0,
    fontSize: brand.typography.bodyLarge.fontSize,
    fontWeight: 500,
    color: brand.ink,
  },
  interactionHint: {
    margin: `${brand.spacing[4]}px 0 0`,
    fontSize: brand.typography.auxiliar.fontSize,
    color: brand.inkMuted,
  },
  drawerLink: {
    padding: `${brand.spacing[12]}px`,
    borderRadius: brand.radius.small,
    color: brand.ink,
    fontSize: brand.typography.bodyLarge.fontSize,
    textDecoration: 'none',
  },
  tabText: {
    margin: 0,
    color: brand.inkSoft,
    fontSize: brand.typography.bodyLarge.fontSize,
    lineHeight: 1.5,
  },
  brandWord: {
    fontSize: brand.typography.subtitle.fontSize,
    fontWeight: 600,
    color: brand.emphasis,
  },
  statusLine: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: `${brand.spacing[8]}px`,
    fontSize: brand.typography.bodyLarge.fontSize,
    color: brand.ink,
  },
}
