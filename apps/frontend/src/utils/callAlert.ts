// Foreground "you were called" alert for the representative's queue ticket:
// a short double beep (Web Audio, no asset) plus a vibration. Mobile browsers
// only allow programmatic audio after a user gesture, so unlockCallAlert() must
// be called from within a gesture (e.g. the queue-entry submit) to resume the
// shared AudioContext; playCallAlert() then works when the call arrives.
//
// Caveats: only fires while the page is visible/foreground (background timers are
// throttled); navigator.vibrate is unsupported on iOS Safari (it no-ops there).

type AudioContextCtor = typeof AudioContext

let audioCtx: AudioContext | null = null

function getCtx(): AudioContext | null {
  const w = globalThis as unknown as {
    AudioContext?: AudioContextCtor
    webkitAudioContext?: AudioContextCtor
  }
  const Ctor = w.AudioContext ?? w.webkitAudioContext
  if (!Ctor) return null
  // Construction can throw (some webviews, privacy modes, hardware-context
  // limit). The alert is best-effort, so never let an audio failure escape into
  // callers — most importantly the queue-entry submit handler.
  try {
    audioCtx ??= new Ctor()
  } catch {
    return null
  }
  return audioCtx
}

export function unlockCallAlert(): void {
  const ctx = getCtx()
  if (ctx && ctx.state === 'suspended') void ctx.resume()
}

export function playCallAlert(): void {
  if (typeof navigator !== 'undefined') navigator.vibrate?.([200, 100, 200])

  const ctx = getCtx()
  if (!ctx) return

  // Best-effort: a Web Audio failure must never escape into the caller (the
  // CALLING transition effect). Vibration above already happened regardless.
  try {
    if (ctx.state === 'suspended') void ctx.resume()

    const start = ctx.currentTime
    // Two short beeps so it reads as an alert, not an incidental sound.
    for (const offset of [0, 0.3]) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.0001, start + offset)
      gain.gain.exponentialRampToValueAtTime(0.3, start + offset + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.25)
      osc.connect(gain).connect(ctx.destination)
      osc.start(start + offset)
      osc.stop(start + offset + 0.26)
    }
  } catch {
    /* ignore — the alert is non-critical */
  }
}
