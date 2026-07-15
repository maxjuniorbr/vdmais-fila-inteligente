import { throttleLimit } from './throttle-limits'

describe('throttleLimit', () => {
  const ENV_KEY = 'THROTTLE_LIMIT_SPEC'

  afterEach(() => {
    delete process.env[ENV_KEY]
  })

  it('falls back to the default when the env var is absent', () => {
    expect(throttleLimit(ENV_KEY, 300)()).toBe(300)
  })

  it('uses the env override when it is a positive decimal', () => {
    process.env[ENV_KEY] = '1500'
    expect(throttleLimit(ENV_KEY, 300)()).toBe(1500)
  })

  it('re-reads the environment on every resolution, not at setup time', () => {
    const resolve = throttleLimit(ENV_KEY, 300)
    expect(resolve()).toBe(300)
    process.env[ENV_KEY] = '900'
    expect(resolve()).toBe(900)
  })

  it.each(['0', '-5', 'abc', '1e3', '0x10', '12.5', ''])(
    'rejects %p and keeps the safe default',
    (raw) => {
      process.env[ENV_KEY] = raw
      expect(throttleLimit(ENV_KEY, 300)()).toBe(300)
    },
  )
})
