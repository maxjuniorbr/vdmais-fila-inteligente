import { ForbiddenException } from '@nestjs/common'
import { SimulationGuard } from './simulation.guard'

describe('SimulationGuard', () => {
  const guard = new SimulationGuard()
  const ORIGINAL_ENV = { ...process.env }

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  function setEnv(env: Record<string, string | undefined>) {
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }

  const LOCAL_DB = 'postgresql://fila:secret@localhost:5432/db'

  // --- fail-closed em NODE_ENV: só development/test liberam ---
  it('blocks when NODE_ENV is production', () => {
    setEnv({ NODE_ENV: 'production', DATABASE_URL: LOCAL_DB })
    expect(() => guard.canActivate()).toThrow(ForbiddenException)
  })

  it('blocks when NODE_ENV is unset (fail-closed, não reabre por esquecimento)', () => {
    setEnv({ NODE_ENV: undefined, DATABASE_URL: LOCAL_DB })
    expect(() => guard.canActivate()).toThrow(ForbiddenException)
  })

  it('blocks an unknown NODE_ENV such as staging', () => {
    setEnv({ NODE_ENV: 'staging', DATABASE_URL: LOCAL_DB })
    expect(() => guard.canActivate()).toThrow(ForbiddenException)
  })

  // --- banco local liberado em ambiente não-produtivo ---
  it('allows development against a localhost database', () => {
    setEnv({ NODE_ENV: 'development', DATABASE_URL: LOCAL_DB, SIMULATION_ALLOW_REMOTE: undefined })
    expect(guard.canActivate()).toBe(true)
  })

  it('allows test against a 127.0.0.1 database', () => {
    setEnv({ NODE_ENV: 'test', DATABASE_URL: 'postgresql://u@127.0.0.1:5432/db', SIMULATION_ALLOW_REMOTE: undefined })
    expect(guard.canActivate()).toBe(true)
  })

  it('allows an IPv6 loopback (::1) database', () => {
    setEnv({ NODE_ENV: 'development', DATABASE_URL: 'postgresql://u@[::1]:5432/db', SIMULATION_ALLOW_REMOTE: undefined })
    expect(guard.canActivate()).toBe(true)
  })

  // --- banco remoto: bloqueado por padrão, só liberado explicitamente e fora de produção ---
  it('blocks a remote database without the explicit escape', () => {
    setEnv({ NODE_ENV: 'development', DATABASE_URL: 'postgresql://u@db.example.com:5432/db', SIMULATION_ALLOW_REMOTE: undefined })
    expect(() => guard.canActivate()).toThrow(ForbiddenException)
  })

  it('allows a remote database when SIMULATION_ALLOW_REMOTE=true in a non-prod env', () => {
    setEnv({ NODE_ENV: 'development', DATABASE_URL: 'postgresql://u@db.example.com:5432/db', SIMULATION_ALLOW_REMOTE: 'true' })
    expect(guard.canActivate()).toBe(true)
  })

  it('still blocks a remote database in production even with SIMULATION_ALLOW_REMOTE=true', () => {
    setEnv({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://u@db.example.com:5432/db', SIMULATION_ALLOW_REMOTE: 'true' })
    expect(() => guard.canActivate()).toThrow(ForbiddenException)
  })
})
