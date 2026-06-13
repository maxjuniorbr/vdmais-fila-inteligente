import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

function fakeAudio(state: 'running' | 'suspended') {
  const gain = {
    gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    connect: vi.fn(() => ({})),
  }
  const osc = {
    type: '',
    frequency: { value: 0 },
    connect: vi.fn(() => gain),
    start: vi.fn(),
    stop: vi.fn(),
  }
  const ctx = {
    state,
    currentTime: 0,
    resume: vi.fn(),
    destination: {},
    createOscillator: () => osc,
    createGain: () => gain,
  }
  return { ctx, osc }
}

describe('callAlert', () => {
  it('resumes a suspended context and plays a double beep with vibration', async () => {
    const vibrate = vi.fn()
    vi.stubGlobal('navigator', { vibrate })
    const { ctx, osc } = fakeAudio('suspended')
    vi.stubGlobal('AudioContext', function FakeAudioContext() {
      return ctx
    })
    vi.resetModules()
    const { playCallAlert, unlockCallAlert } = await import('./callAlert')

    unlockCallAlert()
    expect(ctx.resume).toHaveBeenCalledTimes(1)

    playCallAlert()
    expect(vibrate).toHaveBeenCalledWith([200, 100, 200])
    expect(osc.start).toHaveBeenCalledTimes(2)
    expect(osc.stop).toHaveBeenCalledTimes(2)
  })

  it('stays silent without throwing when the AudioContext cannot be created', async () => {
    const vibrate = vi.fn()
    vi.stubGlobal('navigator', { vibrate })
    vi.stubGlobal('AudioContext', function FailingAudioContext() {
      throw new Error('hardware contexts limit reached')
    })
    vi.resetModules()
    const { playCallAlert, unlockCallAlert } = await import('./callAlert')

    expect(() => {
      unlockCallAlert()
      playCallAlert()
    }).not.toThrow()
    // Vibration still fires even when audio construction fails.
    expect(vibrate).toHaveBeenCalledWith([200, 100, 200])
  })

  it('no-ops without throwing when audio is unavailable', async () => {
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('AudioContext', undefined)
    vi.stubGlobal('webkitAudioContext', undefined)
    vi.resetModules()
    const { playCallAlert, unlockCallAlert } = await import('./callAlert')

    expect(() => {
      unlockCallAlert()
      playCallAlert()
    }).not.toThrow()
  })
})
