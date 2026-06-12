import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  getStaffSessionProfile,
  logoutStaffSession,
  type StaffProfile,
  type StaffRole,
} from '../auth/session'
import { BrandMark } from '../components/BrandMark'
import { Button } from '../components/Button'
import { brand } from '../styles/brand'
import { roleLabel } from '../utils/labels'

interface AccessArea {
  roles: StaffRole[]
  audience: string
  title: string
  description: string
  path: string
  action: string
}

const ACCESS_AREAS: AccessArea[] = [
  {
    roles: ['ADMIN'],
    audience: 'Administrador',
    title: 'Administração',
    description: 'Configure ERs, acessos, caixas e contas da equipe.',
    path: '/admin',
    action: 'Acessar administração',
  },
  {
    roles: ['MANAGER', 'ADMIN'],
    audience: 'Gestora ou administrador',
    title: 'Gestão da fila',
    description:
      'Abra a operação, acompanhe a fila e consulte métricas. Administradores selecionam o ER ao entrar.',
    path: '/gestao',
    action: 'Acessar gestão',
  },
  {
    roles: ['OPERATOR'],
    audience: 'Operadora',
    title: 'Operação',
    description: 'Assuma um caixa, chame senhas e conduza os atendimentos.',
    path: '/operacao',
    action: 'Acessar operação',
  },
  {
    roles: ['ATTENDANT'],
    audience: 'Atendente',
    title: 'Check-in assistido',
    description: 'Localize ou cadastre a RE e faça sua entrada assistida na fila.',
    path: '/checkin',
    action: 'Acessar check-in',
  },
]

function destinationFor(role: StaffRole): AccessArea {
  const destination = ACCESS_AREAS.find((area) => area.roles[0] === role)
  if (!destination) throw new Error('Perfil sem área de acesso configurada')
  return destination
}

export function HomePage() {
  const [profile, setProfile] = useState<StaffProfile | null>(() => getStaffSessionProfile())
  const currentArea = profile ? destinationFor(profile.role) : null
  const availableAreas = profile
    ? ACCESS_AREAS.filter((area) => area.roles.includes(profile.role))
    : []

  async function logout() {
    await logoutStaffSession()
    setProfile(null)
  }

  return (
    <div style={styles.shell}>
      <header style={styles.topbar}>
        <div style={styles.brandRow}>
          <BrandMark size={38} />
          <div>
            <strong style={styles.brandName}>VD+ Fila Inteligente</strong>
            <span style={styles.brandSubtitle}>Acessos internos</span>
          </div>
        </div>
        {profile && (
          <Button
            variant="secondary"
            size="sm"
            type="button"
            onClick={() => void logout()}
          >
            Encerrar sessão
          </Button>
        )}
      </header>

      <main style={styles.content}>
        <section style={styles.hero}>
          <span style={styles.eyebrow}>Portal da equipe</span>
          <h1 style={styles.title}>Acesse sua área de trabalho</h1>
          <p style={styles.introduction}>
            Selecione a opção correspondente ao seu perfil. Cada área solicitará as credenciais
            apropriadas antes de liberar o acesso.
          </p>
        </section>

        {profile && currentArea && (
          <section className="gb-home-session" style={styles.sessionCard} aria-label="Sessão atual">
            <div>
              <span style={styles.sessionLabel}>Sessão reconhecida</span>
              <strong style={styles.sessionName}>{profile.name}</strong>
              <span style={styles.sessionRole}>{roleLabel(profile.role)}</span>
            </div>
            <div style={styles.sessionActions}>
              {availableAreas.map((area) => (
                <Link
                  key={area.path}
                  className="gb-home-primary-link"
                  to={area.path}
                  style={{
                    ...styles.primaryLink,
                    ...(area.path === currentArea.path ? null : styles.secondarySessionLink),
                  }}
                >
                  {area.path === currentArea.path ? 'Continuar em' : 'Acessar'} {area.title}
                </Link>
              ))}
            </div>
          </section>
        )}

        <nav aria-label="Áreas internas">
          <div className="gb-home-access-grid">
            {ACCESS_AREAS.map((area) => {
              const isAvailable = Boolean(profile && area.roles.includes(profile.role))
              return (
                <Link
                  key={area.path}
                  className="gb-home-access-card"
                  to={area.path}
                  style={{
                    ...styles.accessCard,
                    ...(isAvailable ? styles.accessCardCurrent : null),
                  }}
                >
                  <div style={styles.cardTop}>
                    <span style={styles.roleTag}>{area.audience}</span>
                    {isAvailable && <span style={styles.currentTag}>Disponível</span>}
                  </div>
                  <div>
                    <h2 style={styles.cardTitle}>{area.title}</h2>
                    <p style={styles.cardDescription}>{area.description}</p>
                  </div>
                  <span style={styles.cardAction}>{area.action}</span>
                </Link>
              )
            })}
          </div>
        </nav>

        <aside className="gb-home-panel-note" style={styles.panelNote}>
          <div>
            <strong style={styles.noteTitle}>Painel de TV</strong>
            <p style={styles.noteText}>
              O painel possui um endereço específico para cada ER. Ele pode ser copiado e aberto
              pela área de Administração.
            </p>
          </div>
          {profile?.erId && (
            <Link
              className="gb-action-link"
              to={`/painel/${profile.erId}`}
              style={styles.panelLink}
            >
              Abrir painel deste ER
            </Link>
          )}
        </aside>

        <p style={styles.queueNote}>
          A entrada da representante na fila ocorre somente pelo QR Code ou link específico do ER.
        </p>
      </main>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    minHeight: '100vh',
    background: brand.canvas,
    color: brand.ink,
    fontFamily: brand.font,
  },
  topbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1rem',
    padding: '0.9rem max(1rem, calc((100vw - 1120px) / 2))',
    background: brand.surface,
    borderBottom: `1px solid ${brand.border}`,
    color: brand.ink,
  },
  brandRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  brandName: {
    display: 'block',
    fontSize: brand.typography.bodyLarge.fontSize,
    lineHeight: 1.2,
  },
  brandSubtitle: {
    display: 'block',
    marginTop: '0.1rem',
    color: brand.inkMuted,
    fontSize: brand.typography.auxiliar.fontSize,
  },
  content: {
    width: 'min(1120px, calc(100% - 2rem))',
    margin: '0 auto',
    padding: '3.5rem 0 2rem',
  },
  hero: {
    maxWidth: 720,
    marginBottom: '2rem',
  },
  eyebrow: {
    display: 'block',
    marginBottom: '0.5rem',
    color: brand.emphasis,
    fontSize: '0.75rem',
    fontWeight: 700,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
  },
  title: {
    margin: 0,
    color: brand.ink,
    fontSize: 'clamp(2rem, 5vw, 3.25rem)',
    lineHeight: 1.08,
    letterSpacing: '-0.03em',
  },
  introduction: {
    maxWidth: 650,
    margin: '1rem 0 0',
    color: brand.inkSoft,
    fontSize: '1.02rem',
    lineHeight: 1.65,
  },
  sessionCard: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1rem',
    marginBottom: `${brand.spacing[20]}px`,
    padding: `${brand.spacing[16]}px ${brand.spacing[20]}px`,
    border: `1px solid ${brand.border}`,
    borderRadius: brand.radius.large,
    background: brand.canvas,
  },
  sessionLabel: {
    display: 'block',
    color: brand.emphasis,
    fontSize: brand.typography.auxiliar.fontSize,
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
  },
  sessionName: {
    display: 'inline-block',
    marginTop: '0.15rem',
    color: brand.ink,
    fontSize: '1rem',
  },
  sessionRole: {
    marginLeft: '0.5rem',
    color: brand.inkMuted,
    fontSize: '0.85rem',
  },
  primaryLink: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 42,
    padding: '0.6rem 1rem',
    borderRadius: brand.radius.pill,
    background: brand.actionable,
    color: brand.actionableContent,
    fontSize: '0.88rem',
    fontWeight: 700,
    textDecoration: 'none',
    whiteSpace: 'nowrap',
  },
  sessionActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '0.5rem',
    flexWrap: 'wrap',
  },
  secondarySessionLink: {
    border: `2px solid ${brand.actionable}`,
    background: brand.surface,
    color: brand.actionable,
  },
  accessCard: {
    display: 'grid',
    alignContent: 'space-between',
    gap: `${brand.spacing[24]}px`,
    minHeight: 235,
    padding: `${brand.spacing[20]}px`,
    border: `1px solid ${brand.border}`,
    borderRadius: brand.radius.large,
    background: brand.surface,
    boxShadow: brand.shadow,
    color: brand.ink,
    textDecoration: 'none',
  },
  accessCardCurrent: {
    border: `1px solid ${brand.actionable}`,
    boxShadow: '0 0 0 2px rgba(38, 79, 236, 0.12)',
  },
  cardTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.5rem',
  },
  roleTag: {
    color: brand.inkMuted,
    fontSize: '0.7rem',
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
  },
  currentTag: {
    padding: '0.2rem 0.45rem',
    borderRadius: 999,
    background: brand.successSoft,
    color: brand.success,
    fontSize: '0.68rem',
    fontWeight: 700,
  },
  cardTitle: {
    margin: 0,
    color: brand.ink,
    fontSize: brand.typography.title.fontSize,
  },
  cardDescription: {
    margin: '0.55rem 0 0',
    color: brand.inkMuted,
    fontSize: brand.typography.bodySmall.fontSize,
    lineHeight: 1.55,
  },
  cardAction: {
    color: brand.actionable,
    fontSize: brand.typography.bodySmall.fontSize,
    fontWeight: 700,
  },
  panelNote: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1rem',
    marginTop: `${brand.spacing[20]}px`,
    padding: `${brand.spacing[16]}px ${brand.spacing[20]}px`,
    border: `1px solid ${brand.border}`,
    borderRadius: brand.radius.large,
    background: brand.surface,
  },
  noteTitle: {
    color: brand.inkSoft,
    fontSize: '0.92rem',
  },
  noteText: {
    margin: '0.2rem 0 0',
    color: brand.inkMuted,
    fontSize: '0.82rem',
  },
  panelLink: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 38,
    padding: '0.45rem 0.85rem',
    border: `2px solid ${brand.actionable}`,
    borderRadius: brand.radius.pill,
    color: brand.actionable,
    fontSize: '0.82rem',
    fontWeight: 700,
    textDecoration: 'none',
    whiteSpace: 'nowrap',
  },
  queueNote: {
    margin: '1.5rem 0 0',
    color: brand.inkMuted,
    fontSize: '0.8rem',
    textAlign: 'center',
  },
}
